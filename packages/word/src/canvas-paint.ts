import { wordCanvasFont } from "./canvas-text.ts";
import type { WordImageDrawing } from "./drawings.ts";
import { wordHighlightColor } from "./highlight.ts";
import type { WordLayoutFragment, WordLayoutLine, WordLayoutMarker, WordLayoutPage, WordLayoutTable } from "./layout.ts";
import type { WordCellBorders, WordTableBorder } from "./table-format.ts";

/** The drawing subset of a Canvas 2D context. Browser, OffscreenCanvas and server canvases satisfy it. */
export interface WordCanvasContext<Image> {
  font: string;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  textAlign: "start" | "end" | "left" | "right" | "center";
  textBaseline: "top" | "hanging" | "middle" | "alphabetic" | "ideographic" | "bottom";
  direction: "inherit" | "ltr" | "rtl";
  fontKerning?: "auto" | "none" | "normal";
  letterSpacing?: string;
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  clip(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  setLineDash(segments: number[]): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(image: Image, x: number, y: number, width: number, height: number): void;
}

export interface WordPagePaintOptions<Image> {
  /** Device pixels per point. Defaults to CSS pixels (4/3). */
  readonly scale?: number;
  /** Paper colour. Defaults to white; `"transparent"` leaves the canvas untouched. */
  readonly background?: string;
  /** Decoded image for a drawing. Images without a source paint as placeholders. */
  readonly image?: (drawing: WordImageDrawing) => Image | undefined;
}

const PLACEHOLDER = "rgba(0,0,0,0.06)";

/**
 * Paints one laid-out page with the same geometry the editor uses: paragraph decorations,
 * tables, list markers, text and images. Shapes and charts paint as placeholders.
 */
export function paintWordPage<Image>(context: WordCanvasContext<Image>, page: WordLayoutPage, options: WordPagePaintOptions<Image> = {}): void {
  const scale = options.scale ?? 4 / 3;
  context.save();
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
  for (const table of tables) paintTable(context, table, options);
  paintDecorations(context, lines);
  if (page.noteSeparatorY !== undefined) {
    const left = page.section.marginLeftTwips / 20;
    strokeLine(context, left, page.noteSeparatorY, left + 144, page.noteSeparatorY, { style: "single", widthPoints: 0.5, color: "#000000" });
  }
  for (const line of lines) paintLine(context, line, options);
  context.restore();
}

function paintTable<Image>(context: WordCanvasContext<Image>, table: WordLayoutTable, options: WordPagePaintOptions<Image>): void {
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
    paintDecorations(context, cell.lines);
    for (const line of cell.lines) paintLine(context, line, options);
    for (const nested of cell.tables) paintTable(context, nested, options);
  }
}

/** Paragraph shading and borders span every line of the paragraph that shares a decoration box. */
function paintDecorations<Image>(context: WordCanvasContext<Image>, lines: readonly WordLayoutLine[]): void {
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

function paintBorders<Image>(context: WordCanvasContext<Image>, borders: WordCellBorders | undefined, left: number, top: number, right: number, bottom: number): void {
  if (borders?.top) strokeLine(context, left, top + borders.top.widthPoints / 2, right, top + borders.top.widthPoints / 2, borders.top);
  if (borders?.bottom) strokeLine(context, left, bottom - borders.bottom.widthPoints / 2, right, bottom - borders.bottom.widthPoints / 2, borders.bottom);
  if (borders?.left) strokeLine(context, left + borders.left.widthPoints / 2, top, left + borders.left.widthPoints / 2, bottom, borders.left);
  if (borders?.right) strokeLine(context, right - borders.right.widthPoints / 2, top, right - borders.right.widthPoints / 2, bottom, borders.right);
}

function paintLine<Image>(context: WordCanvasContext<Image>, line: WordLayoutLine, options: WordPagePaintOptions<Image>): void {
  if (line.marker !== undefined) paintText(context, line.marker, line.marker.text.trimEnd());
  for (const fragment of line.fragments) {
    if (fragment.kind === "drawing") paintDrawing(context, fragment, options);
    else if (fragment.kind !== "tab") paintText(context, fragment, fragment.text);
  }
}

function paintDrawing<Image>(context: WordCanvasContext<Image>, fragment: WordLayoutFragment, options: WordPagePaintOptions<Image>): void {
  const image = fragment.drawing?.kind === "image" ? options.image?.(fragment.drawing) : undefined;
  if (image !== undefined) {
    context.drawImage(image, fragment.x, fragment.y, fragment.width, fragment.height);
    return;
  }
  context.fillStyle = PLACEHOLDER;
  context.fillRect(fragment.x, fragment.y, fragment.width, fragment.height);
}

function paintText<Image>(context: WordCanvasContext<Image>, item: WordLayoutFragment | WordLayoutMarker, text: string): void {
  const { format } = item;
  const highlight = wordHighlightColor(format.highlight);
  if (highlight !== "transparent") {
    context.fillStyle = highlight;
    context.fillRect(item.x, item.y, item.width, item.height);
  }
  if (text.trim() === "") return;
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

function strokeLine<Image>(context: WordCanvasContext<Image>, x1: number, y1: number, x2: number, y2: number, border: WordTableBorder): void {
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
