import { paintWordPicture } from './picture-paint.ts';
import { paintWordInk, type WordInkViewport, type WordInkPixelContext } from './ink-canvas.ts';
import { wordDrawingCellClip, intersectWordContentBounds, type WordContentBounds } from './table-clipping.ts';
import { wordImagePaintBounds } from './image-paint.ts';
import { layoutChartScene, paintChartScene, type ChartCanvasContext } from "@tumblerjs/charts";
import { canvasWordTextMeasurer, wordCanvasFont, type WordCanvasTextContext } from "./canvas-text.ts";
import type { WordImageDrawing } from "./drawings.ts";
import { wordHighlightColor } from "./highlight.ts";
import type { WordLayoutFragment, WordLayoutLine, WordLayoutMarker, WordLayoutPage, WordLayoutTable, WordTextMeasurer } from "./layout.ts";
import { layoutWordShapeText } from "./shape-text-layout.ts";
import { resolveWordShapeTextInsets } from './shape-text-insets.ts';
import { wordShapePath, type WordAuthoredShape } from "./shapes.ts";
import type { WordCellBorders, WordTableBorder } from "./table-format.ts";
import { resolveWordColour } from "./theme-colours.ts";

/**
 * The drawing subset of a Canvas 2D context. Browser, OffscreenCanvas and server canvases satisfy
 * it; `Path` is the host's Path2D.
 */
export interface WordCanvasContext<Image, Path = unknown> extends ChartCanvasContext<Path>, WordCanvasTextContext, WordInkPixelContext {
  direction: "inherit" | "ltr" | "rtl";
  fontKerning?: "auto" | "none" | "normal";
  letterSpacing?: string;
  scale(x: number, y: number): void;
  setLineDash(segments: number[]): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  drawImage(image: Image, x: number, y: number, width: number, height: number): void;
}

export interface WordPagePaintOptions<Image, Path = unknown> {
  /** Device pixels per point. Defaults to CSS pixels (4/3). */
  readonly scale?: number;
  /** Device-pixel crop. The canvas must have this size; ink reads are clipped to it. */
  readonly viewport?: WordInkViewport;
  /** Synchronous ink pixel budget. Infinity disables it; stored ink is never reduced. */
  readonly inkMaxPixels?: number;
  /** Paint the backdrop used to isolate destination-dependent ink for a DOM overlay. */
  readonly omitDestinationInk?: boolean;
  /** Notify an overlay that native destination ink could not replace its cached image. */
  readonly onInkFallback?: (drawing: WordImageDrawing) => void;
  /** Paper colour. Defaults to white; `"transparent"` leaves the canvas untouched. */
  readonly background?: string;
  /** Decoded image for a drawing; see wordPageImages. Images without a source paint as placeholders. */
  readonly image?: (drawing: WordImageDrawing) => Image | undefined;
  /**
   * Builds the host's Path2D from SVG path data, such as `d => new Path2D(d)`. Shapes and charts
   * paint only when it is supplied; otherwise they paint as placeholders.
   */
  readonly path?: (d: string) => Path;
  /** Lays out shape text; pass the page's measurer so both agree. Defaults to measuring with `context`. */
  readonly measurer?: WordTextMeasurer;
}

type PaintOptions<Image, Path> = WordPagePaintOptions<Image, Path> & { readonly clip?: WordContentBounds };

const PLACEHOLDER = "rgba(0,0,0,0.06)";

/**
 * Paints one laid-out page with the same geometry the editor uses: paragraph decorations,
 * tables, list markers, text, images, shapes and charts.
 */
export function paintWordPage<Image, Path>(context: WordCanvasContext<Image, Path>, page: WordLayoutPage, options: WordPagePaintOptions<Image, Path> = {}): void {
  const scale = options.scale ?? 4 / 3;
  const paintOptions = { ...options, clip: { x: 0, y: 0, width: page.width, height: page.height } };
  const viewport = options.viewport;
  if (viewport && (![viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isSafeInteger)
    || viewport.width <= 0 || viewport.height <= 0 || !Number.isFinite(scale) || scale <= 0)) throw new RangeError('Invalid page pixel viewport.');
  context.save();
  if (options.viewport) context.translate(-options.viewport.x, -options.viewport.y);
  context.scale(scale, scale);
  context.beginPath();
  context.rect(0, 0, page.width, page.height);
  context.clip();
  if (options.background !== "transparent") {
    context.fillStyle = options.background ?? "#ffffff";
    context.fillRect(0, 0, page.width, page.height);
  }
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fontKerning = "none";
  const tables = [...page.columns.flatMap(column => column.tables), ...page.headerTables, ...page.footerTables, ...page.noteTables];
  const lines = [...page.columns.flatMap(column => column.lines), ...page.headerLines, ...page.footerLines, ...page.noteLines];
  const floating = pageDrawingEntries(page).filter(({ fragment }) => fragment.drawing?.placement === 'anchor')
    .sort((left, right) => (left.fragment.drawing?.anchor?.zOrder ?? 0) - (right.fragment.drawing?.anchor?.zOrder ?? 0));
  for (const entry of floating.filter(({ fragment }) => fragment.drawing?.anchor?.behindDocument)) paintFloatingDrawing(context, entry, paintOptions);
  for (const table of tables) paintTable(context, table, paintOptions);
  paintDecorations(context, lines);
  if (page.noteSeparatorY !== undefined) {
    const left = page.section.marginLeftTwips / 20;
    strokeLine(context, left, page.noteSeparatorY, left + 144, page.noteSeparatorY, { style: "single", widthPoints: 0.5, color: "#000000" });
  }
  for (const line of lines) paintLine(context, line, paintOptions);
  for (const entry of floating.filter(({ fragment }) => !fragment.drawing?.anchor?.behindDocument)) paintFloatingDrawing(context, entry, paintOptions);
  context.restore();
}

/** Every image drawn on a page. Optional regions are in page points and restrict decoding to intersecting images. */
export function wordPageImages(page: WordLayoutPage, regions?: readonly WordInkViewport[]): WordImageDrawing[] {
  return [...new Set(pageDrawingFragments(page).flatMap(fragment => {
    const drawing = fragment.drawing;
    if (drawing?.kind !== 'image') return [];
    const box = wordImagePaintBounds(drawing, fragment.width, fragment.height);
    if (regions && (box.width <= 0 || box.height <= 0 || !regions.some(region => fragment.x + box.x < region.x + region.width && fragment.y + box.y < region.y + region.height
      && fragment.x + box.x + box.width > region.x && fragment.y + box.y + box.height > region.y))) return [];
    return [drawing];
  }))];
}
/** Regions whose ink requires composition with the already-painted page. */
export function wordPageInkBounds(page: WordLayoutPage) {
  return pageDrawingEntries(page).flatMap(({ fragment, clip }) => {
    const drawing = fragment.drawing;
    if (drawing?.kind !== 'image' || drawing.inkRendering !== 'raster' || !drawing.inkProjection) return [];
    const bounds = wordImagePaintBounds(drawing, fragment.width, fragment.height);
    const painted = { x: fragment.x + bounds.x, y: fragment.y + bounds.y, width: bounds.width, height: bounds.height };
    const visible = clip ? intersectWordContentBounds(painted, clip) : painted;
    return visible.width > 0 && visible.height > 0 ? [visible] : [];
  });
}

interface DrawingEntry { readonly fragment: WordLayoutFragment; readonly clip?: WordContentBounds }

function pageDrawingFragments(page: WordLayoutPage): WordLayoutFragment[] {
  return pageDrawingEntries(page).map(entry => entry.fragment);
}

function pageDrawingEntries(page: WordLayoutPage): DrawingEntry[] {
  const drawings: DrawingEntry[] = [];
  const visitLines = (lines: readonly WordLayoutLine[], clip?: WordContentBounds) => {
    for (const line of lines)
      for (const fragment of line.fragments) if (fragment.drawing) {
        const drawingClip = wordDrawingCellClip(fragment.drawing, clip);
        drawings.push({ fragment, ...(drawingClip ? { clip: drawingClip } : {}) });
      }
  };
  const visitTable = (table: WordLayoutTable, ancestor?: WordContentBounds): void => {
    for (const cell of table.cells) {
      const clip = ancestor ? intersectWordContentBounds(ancestor, cell) : cell;
      visitLines(cell.lines, clip);
      for (const nested of cell.tables) visitTable(nested, clip);
    }
  };
  for (const table of [...page.columns.flatMap(column => column.tables), ...page.headerTables, ...page.footerTables, ...page.noteTables]) visitTable(table);
  visitLines([...page.columns.flatMap(column => column.lines), ...page.headerLines, ...page.footerLines, ...page.noteLines]);
  return drawings;
}

function paintFloatingDrawing<Image, Path>(context: WordCanvasContext<Image, Path>, entry: DrawingEntry, options: PaintOptions<Image, Path>): void {
  if (!entry.clip) return paintDrawing(context, entry.fragment, options);
  const clip = options.clip ? intersectWordContentBounds(options.clip, entry.clip) : entry.clip;
  context.save();
  context.beginPath();
  context.rect(clip.x, clip.y, clip.width, clip.height);
  context.clip();
  try {
    paintDrawing(context, entry.fragment, { ...options, clip });
  } finally {
    context.restore();
  }
}

function paintTable<Image, Path>(context: WordCanvasContext<Image, Path>, table: WordLayoutTable, options: PaintOptions<Image, Path>): void {
  for (const cell of table.cells) {
    if (cell.shading === undefined) continue;
    context.fillStyle = cell.shading;
    context.fillRect(cell.x, cell.y, cell.width, cell.height);
  }
  for (const edge of table.borders ?? []) {
    if (edge.orientation === "horizontal") strokeLine(context, edge.x, edge.y, edge.x + edge.length, edge.y, edge.border);
    else strokeLine(context, edge.x, edge.y, edge.x, edge.y + edge.length, edge.border);
  }
  for (const cell of table.cells) {
    context.save();
    context.beginPath();
    context.rect(cell.x, cell.y, cell.width, cell.height);
    context.clip();
    try {
      const clip = options.clip ? intersectWordContentBounds(options.clip, cell) : cell;
      const cellOptions = { ...options, clip };
      paintDecorations(context, cell.lines);
      for (const line of cell.lines) paintLine(context, line, cellOptions);
      for (const nested of cell.tables) paintTable(context, nested, cellOptions);
    } finally {
      context.restore();
    }
  }
}

/** Paragraph shading and borders span every line of the paragraph that shares a decoration box. */
function paintDecorations<Image, Path>(context: WordCanvasContext<Image, Path>, lines: readonly WordLayoutLine[]): void {
  const boxes = new Map<string, { decoration: NonNullable<WordLayoutLine["paragraphDecoration"]>; top: number; bottom: number }>();
  for (const line of lines) {
    const decoration = line.paragraphDecoration;
    if (decoration === undefined) continue;
    const key = `${line.paragraphElementId}:${decoration.x}:${decoration.width}`;
    const box = boxes.get(key);
    if (box) box.bottom = Math.max(box.bottom, line.y + line.height);
    else boxes.set(key, { decoration, top: line.y, bottom: line.y + line.height });
  }
  for (const { decoration, top, bottom } of boxes.values()) {
    const left = decoration.x, right = decoration.x + decoration.width;
    if (decoration.shading !== undefined) {
      context.fillStyle = decoration.shading;
      context.fillRect(left, top, decoration.width, bottom - top);
    }
    paintBorders(context, decoration.borders, left, top, right, bottom);
  }
}

function paintBorders<Image, Path>(context: WordCanvasContext<Image, Path>, borders: WordCellBorders | undefined, left: number, top: number, right: number, bottom: number): void {
  if (borders?.top) strokeLine(context, left, top + borders.top.widthPoints / 2, right, top + borders.top.widthPoints / 2, borders.top);
  if (borders?.bottom) strokeLine(context, left, bottom - borders.bottom.widthPoints / 2, right, bottom - borders.bottom.widthPoints / 2, borders.bottom);
  if (borders?.left) strokeLine(context, left + borders.left.widthPoints / 2, top, left + borders.left.widthPoints / 2, bottom, borders.left);
  if (borders?.right) strokeLine(context, right - borders.right.widthPoints / 2, top, right - borders.right.widthPoints / 2, bottom, borders.right);
}

function paintLine<Image, Path>(context: WordCanvasContext<Image, Path>, line: WordLayoutLine, options: PaintOptions<Image, Path>): void {
  if (line.marker !== undefined) paintText(context, line.marker, line.marker.text.trimEnd());
  for (const fragment of line.fragments) {
    if (fragment.kind === "drawing") {
      if (fragment.drawing?.placement !== "anchor") paintDrawing(context, fragment, options);
    }
    else if (fragment.kind !== "tab") paintText(context, fragment, fragment.text);
  }
}

function paintDrawing<Image, Path>(context: WordCanvasContext<Image, Path>, fragment: WordLayoutFragment, options: PaintOptions<Image, Path>): void {
  const drawing = fragment.drawing;
  if (options.omitDestinationInk && drawing?.kind === 'image' && drawing.inkRendering === 'raster') return;
  if (paintWordInk(context, fragment, options.scale ?? 4 / 3, options.inkMaxPixels, options.viewport, options.clip)) return;
  if (drawing?.kind === 'image' && options.viewport) {
    const box = wordImagePaintBounds(drawing, fragment.width, fragment.height);
    const scale = options.scale ?? 4 / 3, view = options.viewport;
    if (box.width <= 0 || box.height <= 0 || (fragment.x + box.x + box.width) * scale <= view.x || (fragment.y + box.y + box.height) * scale <= view.y
      || (fragment.x + box.x) * scale >= view.x + view.width || (fragment.y + box.y) * scale >= view.y + view.height) return;
  }
  if (drawing?.kind === 'image' && drawing.inkRendering === 'raster') options.onInkFallback?.(drawing);
  const image = drawing?.kind === "image" ? options.image?.(drawing) : undefined;
  if (image !== undefined && drawing?.kind === 'image') {
    if (drawing.picture) return paintWordPicture(context, image, drawing.picture, fragment);
    const box = wordImagePaintBounds(drawing, fragment.width, fragment.height);
    context.drawImage(image, fragment.x + box.x, fragment.y + box.y, box.width, box.height);
    return;
  }
  if (options.path !== undefined && drawing?.kind === "shape") return paintShape(context, drawing.shape, fragment, { ...options, path: options.path });
  if (options.path !== undefined && drawing?.kind === "chart" && drawing.model.status === "supported") {
    // Charts lay out in CSS pixels, as the editor draws them.
    const pixels = 4 / 3;
    const scene = layoutChartScene(drawing.model, fragment.width * pixels, fragment.height * pixels, {
      measureText: (text, font) => {
        context.font = font;
        return context.measureText(text).width;
      },
    });
    context.save();
    context.translate(fragment.x, fragment.y);
    context.scale(1 / pixels, 1 / pixels);
    paintChartScene(context, scene, options.path);
    context.restore();
    return;
  }
  context.fillStyle = PLACEHOLDER;
  context.fillRect(fragment.x, fragment.y, fragment.width, fragment.height);
}

function paintShape<Image, Path>(context: WordCanvasContext<Image, Path>, shape: WordAuthoredShape, fragment: WordLayoutFragment, options: WordPagePaintOptions<Image, Path> & { readonly path: (d: string) => Path }): void {
  const fill = resolveWordColour(shape.fill), outline = resolveWordColour(shape.outline);
  context.save();
  context.translate(fragment.x, fragment.y);
  context.save();
  // The outline stretches to the frame, as the editor's SVG does with preserveAspectRatio="none".
  context.scale(fragment.width / shape.width, fragment.height / shape.height);
  const outlinePath = options.path(wordShapePath(shape));
  if (fill !== "none" && shape.preset !== "line") {
    context.fillStyle = fill;
    context.fill(outlinePath);
  }
  if (outline !== "none" && shape.outlineWidth > 0) {
    context.strokeStyle = outline;
    context.lineWidth = shape.outlineWidth;
    context.stroke(outlinePath);
  }
  context.restore();
  const text = layoutWordShapeText(shape, fragment.width, fragment.height, options.measurer ?? canvasWordTextMeasurer(context));
  if (text.lines.length > 0 || text.tables.length > 0) {
    // Overflowing text is clipped to the text box, as in the editor.
    context.beginPath();
    const inset = resolveWordShapeTextInsets(shape);
    context.rect(inset.left, inset.top, fragment.width - inset.left - inset.right, fragment.height - inset.top - inset.bottom);
    context.clip();
    context.translate(text.x, text.y);
    for (const table of text.tables) paintTable(context, table, options);
    paintDecorations(context, text.lines);
    for (const line of text.lines) paintLine(context, line, options);
  }
  context.restore();
}

function paintText<Image, Path>(context: WordCanvasContext<Image, Path>, item: WordLayoutFragment | WordLayoutMarker, text: string): void {
  const { format } = item;
  const highlight = wordHighlightColor(format.highlight);
  const background = highlight === "transparent" ? format.shading ?? "transparent" : highlight;
  if (background !== "transparent") {
    context.fillStyle = background;
    context.fillRect(item.x, item.y, item.width, item.height);
  }
  if (text.trim() === "" && !("wordSpacing" in item)) return;
  // The context is already scaled to points, so the font is sized in points.
  context.font = wordCanvasFont(format, 1);
  context.direction = format.rightToLeft ? "rtl" : "ltr";
  context.letterSpacing = `${format.characterSpacingPoints ?? 0}px`;
  context.fillStyle = format.color;
  context.fillText(text, item.x, item.baseline);
  const size = format.fontSizePoints;
  const thickness = Math.max(0.5, size / 18);
  const rule = (y: number) => strokeLine(context, item.x, y, item.x + item.width, y, { style: "single", widthPoints: thickness, color: format.color });
  if (format.underline !== "none") rule(item.baseline + size * 0.12);
  if (format.underline === "double") rule(item.baseline + size * 0.12 + thickness * 2);
  if (format.strike) rule(item.baseline - size * 0.3);
}

function strokeLine<Image, Path>(context: WordCanvasContext<Image, Path>, x1: number, y1: number, x2: number, y2: number, border: WordTableBorder): void {
  if (border.style === "none" || border.widthPoints <= 0) return;
  context.strokeStyle = typeof border.color === "string" ? border.color : "#000000";
  const double = border.style === "double";
  const width = double ? border.widthPoints / 3 : border.widthPoints;
  context.lineWidth = width;
  context.setLineDash(border.style === "dotted" ? [width, width * 2] : border.style === "dashed" ? [width * 4, width * 3] : []);
  const offsets = double ? [-width, width] : [0];
  const vertical = x1 === x2;
  for (const offset of offsets) {
    context.beginPath();
    context.moveTo(x1 + (vertical ? offset : 0), y1 + (vertical ? 0 : offset));
    context.lineTo(x2 + (vertical ? offset : 0), y2 + (vertical ? 0 : offset));
    context.stroke();
  }
  context.setLineDash([]);
}
