import { applySpreadsheetDifferentialFormats, type SpreadsheetCellFormat, type SpreadsheetColor, type SpreadsheetDifferentialFormat } from './styles.ts';
import type { CellAddress } from './references.ts';
import type { SpreadsheetCellValue, SpreadsheetWorksheet } from './worksheet.ts';

/** Canvas 2D subset used for cells. Browser, OffscreenCanvas and server canvases satisfy it. */
export interface SpreadsheetCellCanvasContext {
  font: string;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  textAlign: 'start' | 'end' | 'left' | 'right' | 'center';
  textBaseline: 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom';
  direction?: 'ltr' | 'rtl' | 'inherit';
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  clip(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  setLineDash(segments: number[]): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number; fontBoundingBoxAscent?: number; fontBoundingBoxDescent?: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number };
}

export type SpreadsheetBorderSide = 'left' | 'right' | 'top' | 'bottom';
export interface SpreadsheetBorderPaint {
  readonly width: number;
  readonly pattern: 'solid' | 'dash' | 'dot' | 'double';
  /** Undefined borders use the theme foreground. */
  readonly color: string | undefined;
}

/**
 * A cell's formats resolved to plain paint values. It holds no workbook references, so hosts
 * can resolve on one thread and paint on another. Undefined colours follow the host theme.
 */
export interface SpreadsheetCellPaint {
  readonly text: string;
  readonly fill: string | undefined;
  readonly color: string | undefined;
  readonly fontFamily: string;
  /** CSS pixels. */
  readonly fontSize: number;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strike: boolean;
  readonly borders: Readonly<Record<SpreadsheetBorderSide, SpreadsheetBorderPaint | undefined>>;
  readonly horizontal: 'left' | 'center' | 'right';
  readonly vertical: 'top' | 'center' | 'bottom';
  readonly wrap: boolean;
  /** SpreadsheetML textRotation: 0-90 counterclockwise, 91-180 clockwise, 255 stacked. */
  readonly rotation: number;
  readonly indent: number;
  readonly rtl: boolean;
}

export interface SpreadsheetCellFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Paint width for text spilling into blank neighbours. */
  readonly overflowWidth?: number | undefined;
  readonly selected?: boolean;
}

export interface SpreadsheetPaintColours {
  readonly background: string;
  readonly foreground: string;
  readonly gridline: string;
  readonly selection: string;
}

const styleCache = new WeakMap<SpreadsheetWorksheet, Map<string, SpreadsheetCellFormat>>();

/** Applies conditional formats and Excel's General alignment, which depends on the value type. */
export function spreadsheetPaintStyle(
  sheet: SpreadsheetWorksheet,
  reference: string | CellAddress,
  conditional: readonly SpreadsheetDifferentialFormat[],
  value: SpreadsheetCellValue | undefined,
): SpreadsheetCellFormat {
  let cache = styleCache.get(sheet);
  if (!cache) styleCache.set(sheet, cache = new Map());
  const general = value?.type === 'number' || value?.type === 'date' ? 'right' : value?.type === 'boolean' || value?.type === 'error' ? 'center' : 'left';
  const key = `${sheet.effectiveStyleIndex(reference) ?? 0}:${general}:${conditional.map(format => sheet.styles.differentialFormats.indexOf(format)).join(',')}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const style = applySpreadsheetDifferentialFormats(sheet.cellStyle(reference), conditional);
  const result = style.alignment.horizontal === undefined || style.alignment.horizontal === 'general'
    ? { ...style, alignment: { ...style.alignment, horizontal: general } }
    : style;
  cache.set(key, result);
  return result;
}

/** Resolves theme colours, fonts and borders for a style returned by `spreadsheetPaintStyle`. */
export function resolveSpreadsheetCellPaint(sheet: SpreadsheetWorksheet, style: SpreadsheetCellFormat, text: string): SpreadsheetCellPaint {
  const color = (value: SpreadsheetColor | undefined) => {
    const argb = sheet.styles.resolveColor(value);
    return argb ? `#${argb.slice(2)}` : undefined;
  };
  const border = (side: SpreadsheetBorderSide): SpreadsheetBorderPaint | undefined => {
    const edge = style.border[side];
    if (!edge.style) return undefined;
    const name = edge.style.toLowerCase();
    return {
      width: name === 'thick' || name === 'double' ? 3 : name.includes('medium') ? 2 : 1,
      pattern: name === 'double' ? 'double' : name.includes('dash') ? 'dash' : name.includes('dot') ? 'dot' : 'solid',
      color: color(edge.color),
    };
  };
  const { horizontal, vertical } = style.alignment;
  return {
    text,
    fill: style.fill.patternType === 'solid' ? color(style.fill.foreground) : undefined,
    color: color(style.font.color),
    fontFamily: sheet.styles.resolveFontName(style.font),
    fontSize: (sheet.styles.resolveFontSize(style.font) * 4) / 3,
    bold: style.font.bold,
    italic: style.font.italic,
    underline: style.font.underline !== undefined,
    strike: style.font.strike,
    borders: { left: border('left'), right: border('right'), top: border('top'), bottom: border('bottom') },
    horizontal: horizontal === 'right' ? 'right' : horizontal === 'center' || horizontal === 'centerContinuous' ? 'center' : 'left',
    vertical: vertical === 'top' ? 'top' : vertical === 'center' || vertical === 'distributed' || vertical === 'justify' ? 'center' : 'bottom',
    wrap: style.alignment.wrapText,
    rotation: style.alignment.textRotation,
    indent: style.alignment.indent,
    rtl: style.alignment.readingOrder === 2,
  };
}

/**
 * Paints one cell. Hosts paint every background before any text so spilled text stays visible.
 * `prepareFont` maps an authored family to one the host has loaded.
 */
export function paintSpreadsheetCell(
  context: SpreadsheetCellCanvasContext,
  cell: SpreadsheetCellPaint,
  frame: SpreadsheetCellFrame,
  colours: SpreadsheetPaintColours,
  gridlines: boolean,
  phase: 'background' | 'text',
  options: { readonly opaque?: boolean; readonly prepareFont?: (family: string) => string } = {},
) {
  const { x: left, y: top, width, height } = frame;
  context.save();
  if (phase === 'background') {
    if (!options.opaque) context.clearRect(left, top, width, height);
    const background = cell.fill ?? colours.background;
    context.fillStyle = background;
    context.fillRect(left, top, width, height);
    if (frame.selected) {
      context.fillStyle = colours.selection;
      context.fillRect(left, top, width, height);
    }
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      const edge = cell.borders[side];
      if (!edge && (!gridlines || side === 'left' || side === 'top')) continue;
      const size = edge?.width ?? 1;
      context.strokeStyle = edge ? edge.color ?? colours.foreground : colours.gridline;
      context.lineWidth = size;
      context.setLineDash(edge?.pattern === 'dash' ? [4, 3] : edge?.pattern === 'dot' ? [1, 2] : []);
      const x = side === 'right' ? left + width - size / 2 : left + size / 2;
      const y = side === 'bottom' ? top + height - size / 2 : top + size / 2;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(side === 'left' || side === 'right' ? x : left + width, side === 'top' || side === 'bottom' ? y : top + height);
      context.stroke();
      if (edge?.pattern === 'double') {
        context.strokeStyle = background;
        context.lineWidth = 1;
        context.stroke();
      }
    }
    context.restore();
    return;
  }
  if (!cell.text) {
    context.restore();
    return;
  }
  context.beginPath();
  context.rect(left, top, frame.overflowWidth ?? width, height);
  context.clip();
  const font = paintFont(context, cell, options.prepareFont);
  context.font = font.shorthand;
  context.fillStyle = cell.color ?? colours.foreground;
  context.direction = cell.rtl ? 'rtl' : 'ltr';
  context.textBaseline = 'alphabetic';
  const stacked = cell.rotation === 255;
  const lines = stacked
    ? [...cell.text.replaceAll('\n', '')]
    : cell.wrap
      ? wrapSpreadsheetText(context, cell.text, Math.max(0, width - 16))
      : [cell.text.replaceAll('\n', ' ')];
  const blockHeight = font.lineHeight * lines.length;
  const borderWidth = (side: SpreadsheetBorderSide) => cell.borders[side]?.width ?? (side === 'bottom' || side === 'right' ? 1 : 0);
  const contentTop = top + borderWidth('top') + 1;
  const contentHeight = height - borderWidth('top') - 1 - borderWidth('bottom') - 1;
  const textTop = cell.vertical === 'top'
    ? contentTop
    : cell.vertical === 'center'
      ? contentTop + (contentHeight - blockHeight) / 2
      : contentTop + contentHeight - blockHeight;
  const indent = cell.indent > 0 ? cell.indent * context.measureText('0').width * 3 : 0;
  const horizontal = stacked ? 'center' : cell.horizontal;
  const x = horizontal === 'right'
    ? left + width - borderWidth('right') - 8 - indent
    : horizontal === 'center'
      ? left + (width + borderWidth('left') - borderWidth('right')) / 2
      : left + borderWidth('left') + 8 + indent;
  context.textAlign = horizontal;
  if (cell.rotation !== 0 && !stacked) {
    context.translate(left + width / 2, top + height / 2);
    context.rotate(((cell.rotation <= 90 ? -cell.rotation : 180 - cell.rotation) * Math.PI) / 180);
    context.translate(-left - width / 2, -top - height / 2);
  }
  for (const [index, line] of lines.entries()) {
    const y = textTop + index * font.lineHeight + font.baseline;
    context.fillText(line, x, y);
    if (!cell.underline && !cell.strike) continue;
    const length = context.measureText(line).width;
    const start = horizontal === 'right' ? x - length : horizontal === 'center' ? x - length / 2 : x;
    context.strokeStyle = context.fillStyle;
    context.lineWidth = Math.max(1, font.fontSize / 14);
    context.setLineDash([]);
    for (const offset of [...(cell.underline ? [1] : []), ...(cell.strike ? [-font.fontSize * 0.35] : [])]) {
      context.beginPath();
      context.moveTo(start, y + offset);
      context.lineTo(start + length, y + offset);
      context.stroke();
    }
  }
  context.restore();
}

interface PaintFont { readonly shorthand: string; readonly fontSize: number; readonly lineHeight: number; readonly baseline: number }
const fontCache = new Map<string, PaintFont>();

/** Clears measured font metrics after web fonts finish loading. */
export function invalidateSpreadsheetPaintFonts() {
  fontCache.clear();
}

function paintFont(context: SpreadsheetCellCanvasContext, cell: SpreadsheetCellPaint, prepareFont: ((family: string) => string) | undefined): PaintFont {
  const family = prepareFont?.(cell.fontFamily) ?? cell.fontFamily;
  const shorthand = `${cell.italic ? 'italic ' : ''}${cell.bold ? '700 ' : ''}${cell.fontSize}px ${JSON.stringify(family)},sans-serif`;
  let result = fontCache.get(shorthand);
  if (!result) {
    context.font = shorthand;
    const metrics = context.measureText('Mg');
    const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
    // Match the DOM cell's normal font strut instead of inheriting the grid heading line height.
    const lineHeight = Math.max(cell.fontSize, ascent + descent);
    result = { shorthand, fontSize: cell.fontSize, lineHeight, baseline: (lineHeight - ascent - descent) / 2 + ascent };
    if (fontCache.size >= 256) fontCache.delete(fontCache.keys().next().value!);
    fontCache.set(shorthand, result);
  }
  return result;
}

/** Breaks at whitespace, then between characters for words wider than the line. */
export function wrapSpreadsheetText(context: Pick<SpreadsheetCellCanvasContext, 'measureText'>, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      if (line && context.measureText(line + word).width > width) {
        lines.push(line);
        line = '';
      }
      if (context.measureText(word).width > width) {
        for (const character of word) {
          if (line && context.measureText(line + character).width > width) {
            lines.push(line);
            line = '';
          }
          line += character;
        }
      } else line += word;
    }
    lines.push(line);
  }
  return lines;
}
