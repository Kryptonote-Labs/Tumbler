import {
  applySpreadsheetDifferentialFormats,
  type SpreadsheetCellFormat,
  type SpreadsheetWorksheet,
} from '@tumblerjs/sheets';

export interface SpreadsheetPaintCell {
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly text: string;
  readonly style: SpreadsheetCellFormat;
  readonly overflowWidth: number | undefined;
  readonly selected: boolean;
}
export interface SpreadsheetPaintColours {
  readonly background: string;
  readonly foreground: string;
  readonly gridline: string;
  readonly selection: string;
}

/** Paint the same cell formats as the DOM head into a retained row bitmap. */
export function paintSpreadsheetCell(
  context: CanvasRenderingContext2D,
  sheet: SpreadsheetWorksheet,
  cell: SpreadsheetPaintCell,
  colours: SpreadsheetPaintColours,
  gridlines: boolean,
  phase: 'background' | 'text',
  opaque = false,
) {
  const { left, width, height, style } = cell;
  const color = (value: Parameters<typeof sheet.styles.resolveColor>[0], fallback: string) => {
    const argb = sheet.styles.resolveColor(value);
    return argb ? `#${argb.slice(2)}` : fallback;
  };
  context.save();
  if (phase === 'background') {
    if (!opaque) context.clearRect(left, 0, width, height);
    context.fillStyle =
      style.fill.patternType === 'solid'
        ? color(style.fill.foreground, colours.background)
        : colours.background;
    context.fillRect(left, 0, width, height);
    if (cell.selected) {
      context.fillStyle = colours.selection;
      context.fillRect(left, 0, width, height);
    }
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      const edge = style.border[side];
      if (!edge.style && (!gridlines || side === 'left' || side === 'top')) continue;
      const size =
        edge.style === 'thick' || edge.style === 'double'
          ? 3
          : edge.style?.includes('medium')
            ? 2
            : 1;
      context.strokeStyle = color(edge.color, edge.style ? colours.foreground : colours.gridline);
      context.lineWidth = size;
      const dash = edge.style?.toLowerCase();
      context.setLineDash(dash?.includes('dash') ? [4, 3] : dash?.includes('dot') ? [1, 2] : []);
      const x = side === 'right' ? left + width - size / 2 : left + size / 2;
      const y = side === 'bottom' ? height - size / 2 : size / 2;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(
        side === 'left' || side === 'right' ? x : left + width,
        side === 'top' || side === 'bottom' ? y : height,
      );
      context.stroke();
      if (edge.style === 'double') {
        context.strokeStyle = context.fillStyle;
        context.lineWidth = 1;
        context.stroke();
      }
    }
  }
  if (phase === 'background' || !cell.text) {
    context.restore();
    return;
  }
  context.beginPath();
  context.rect(left, 0, cell.overflowWidth ?? width, height);
  context.clip();
  const font = paintFont(context, sheet, style);
  const { fontSize, lineHeight, baseline } = font;
  context.font = font.shorthand;
  context.fillStyle = color(style.font.color, colours.foreground);
  context.direction = style.alignment.readingOrder === 2 ? 'rtl' : 'ltr';
  context.textBaseline = 'alphabetic';
  const available = Math.max(0, width - 16);
  const lines = style.alignment.wrapText
    ? wrap(context, cell.text, available)
    : [cell.text.replaceAll('\n', ' ')];
  const blockHeight = lineHeight * lines.length;
  const borderWidth = (side: 'top' | 'bottom' | 'left' | 'right') => {
    const edge = style.border[side].style;
    return edge === 'thick' || edge === 'double'
      ? 3
      : edge?.includes('medium')
        ? 2
        : edge
          ? 1
          : side === 'bottom' || side === 'right'
            ? 1
            : 0;
  };
  const contentTop = borderWidth('top') + 1;
  const contentHeight = height - contentTop - borderWidth('bottom') - 1;
  const top =
    style.alignment.vertical === 'top'
      ? contentTop
      : style.alignment.vertical === 'center' ||
          style.alignment.vertical === 'distributed' ||
          style.alignment.vertical === 'justify'
        ? contentTop + (contentHeight - blockHeight) / 2
        : contentTop + contentHeight - blockHeight;
  const alignment = style.alignment.horizontal;
  const indent =
    style.alignment.indent > 0 ? style.alignment.indent * context.measureText('0').width * 3 : 0;
  const x =
    alignment === 'right'
      ? left + width - borderWidth('right') - 8 - indent
      : alignment === 'center' || alignment === 'centerContinuous'
        ? left + (width + borderWidth('left') - borderWidth('right')) / 2
        : left + borderWidth('left') + 8 + indent;
  context.textAlign =
    alignment === 'right'
      ? 'right'
      : alignment === 'center' || alignment === 'centerContinuous'
        ? 'center'
        : 'left';
  if (style.alignment.textRotation !== 0 && style.alignment.textRotation !== 255) {
    context.translate(left + width / 2, height / 2);
    const rotation = style.alignment.textRotation;
    context.rotate(((rotation <= 90 ? -rotation : 180 - rotation) * Math.PI) / 180);
    context.translate(-left - width / 2, -height / 2);
  }
  for (const [index, line] of lines.entries()) {
    const y = top + index * lineHeight + baseline;
    context.fillText(line, x, y);
    if (style.font.underline !== undefined || style.font.strike) {
      const length = context.measureText(line).width;
      const start =
        context.textAlign === 'right'
          ? x - length
          : context.textAlign === 'center'
            ? x - length / 2
            : x;
      context.strokeStyle = context.fillStyle;
      context.lineWidth = Math.max(1, fontSize / 14);
      context.setLineDash([]);
      for (const offset of [
        ...(style.font.underline !== undefined ? [1] : []),
        ...(style.font.strike ? [-fontSize * 0.35] : []),
      ]) {
        context.beginPath();
        context.moveTo(start, y + offset);
        context.lineTo(start + length, y + offset);
        context.stroke();
      }
    }
  }
  context.restore();
}

const styleCache = new WeakMap<SpreadsheetWorksheet, Map<string, SpreadsheetCellFormat>>();
let fontCache = new WeakMap<
  SpreadsheetWorksheet,
  WeakMap<
    SpreadsheetCellFormat,
    { shorthand: string; fontSize: number; lineHeight: number; baseline: number }
  >
>();

export function invalidateSpreadsheetPaintFonts() {
  fontCache = new WeakMap();
}

function paintFont(
  context: CanvasRenderingContext2D,
  sheet: SpreadsheetWorksheet,
  style: SpreadsheetCellFormat,
) {
  let fonts = fontCache.get(sheet);
  if (!fonts) {
    fonts = new WeakMap();
    fontCache.set(sheet, fonts);
  }
  let result = fonts.get(style);
  if (!result) {
    const fontSize = (sheet.styles.resolveFontSize(style.font) * 4) / 3;
    const shorthand = `${style.font.italic ? 'italic ' : ''}${style.font.bold ? '700 ' : ''}${fontSize}px ${JSON.stringify(sheet.styles.resolveFontName(style.font))},sans-serif`;
    context.font = shorthand;
    const metrics = context.measureText('Mg');
    const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
    // Match the DOM cell's normal font strut instead of inheriting the grid heading line height.
    const lineHeight = Math.max(fontSize, ascent + descent);
    result = {
      shorthand,
      fontSize,
      lineHeight,
      baseline: (lineHeight - ascent - descent) / 2 + ascent,
    };
    fonts.set(style, result);
  }
  return result;
}

export function spreadsheetPaintStyle(
  sheet: SpreadsheetWorksheet,
  reference: string,
  conditional: Parameters<typeof applySpreadsheetDifferentialFormats>[1],
  numeric: boolean,
): SpreadsheetCellFormat {
  let cache = styleCache.get(sheet);
  if (!cache) {
    cache = new Map();
    styleCache.set(sheet, cache);
  }
  const key = `${sheet.effectiveStyleIndex(reference) ?? 0}:${numeric}:${conditional.map((format) => sheet.styles.differentialFormats.indexOf(format)).join(',')}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const style = applySpreadsheetDifferentialFormats(sheet.cellStyle(reference), conditional);
  const result =
    style.alignment.horizontal === undefined || style.alignment.horizontal === 'general'
      ? { ...style, alignment: { ...style.alignment, horizontal: numeric ? 'right' : 'left' } }
      : style;
  cache.set(key, result);
  return result;
}

function wrap(context: CanvasRenderingContext2D, text: string, width: number): string[] {
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
