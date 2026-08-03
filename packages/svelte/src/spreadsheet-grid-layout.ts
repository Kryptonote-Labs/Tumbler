import type { SparseAxisGeometry } from "@tumblerjs/core";
import type { CellRange, SpreadsheetDrawingAnchor, SpreadsheetDrawingBounds } from "@tumblerjs/sheets";
import type { SpreadsheetViewport, VirtualGridItem } from "./spreadsheet-viewport.ts";

export interface SpreadsheetMergeLayout {
  readonly range: CellRange;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface SpreadsheetGridLayout {
  readonly rows: readonly VirtualGridItem[];
  readonly columns: readonly VirtualGridItem[];
  readonly merges: readonly SpreadsheetMergeLayout[];
}

export function composeSpreadsheetGridLayout(input: {
  readonly viewport: SpreadsheetViewport;
  readonly rowGeometry: SparseAxisGeometry;
  readonly columnGeometry: SparseAxisGeometry;
  readonly frozenRows: number;
  readonly frozenColumns: number;
  readonly merges: readonly CellRange[];
}): SpreadsheetGridLayout {
  const rows = includeFrozen(input.viewport.rows, input.rowGeometry, input.frozenRows);
  const columns = includeFrozen(input.viewport.columns, input.columnGeometry, input.frozenColumns);
  const merges = input.merges.filter((range) =>
    rows.some((row) => row.index >= range.start.row && row.index <= range.end.row) &&
    columns.some((column) => column.index >= range.start.column && column.index <= range.end.column)
  ).map((range) => Object.freeze({
    range,
    left: input.columnGeometry.start(range.start.column),
    top: input.rowGeometry.start(range.start.row),
    width: input.columnGeometry.start(range.end.column) + input.columnGeometry.size(range.end.column) - input.columnGeometry.start(range.start.column),
    height: input.rowGeometry.start(range.end.row) + input.rowGeometry.size(range.end.row) - input.rowGeometry.start(range.start.row),
  }));
  return Object.freeze({ rows, columns, merges: Object.freeze(merges) });
}

export function frozenGridTranslation(input: {
  readonly row: number;
  readonly column: number;
  readonly frozenRows: number;
  readonly frozenColumns: number;
  readonly scrollTop: number;
  readonly scrollLeft: number;
}): { readonly x: number; readonly y: number } {
  return Object.freeze({
    x: input.column <= input.frozenColumns ? input.scrollLeft : 0,
    y: input.row <= input.frozenRows ? input.scrollTop : 0,
  });
}

export function spreadsheetCellLayer(input: {
  readonly row: number;
  readonly column: number;
  readonly frozenRows: number;
  readonly frozenColumns: number;
}): 1 | 2 {
  return input.row <= input.frozenRows || input.column <= input.frozenColumns ? 2 : 1;
}

export function spreadsheetDrawingRegion(
  anchor: SpreadsheetDrawingAnchor,
  frozenRows: number,
  frozenColumns: number,
): "body" | "frozen-row" | "frozen-column" {
  if (![frozenRows, frozenColumns].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new RangeError("Frozen row and column counts must be non-negative integers.");
  }
  if (anchor.kind === "absolute") return "body";
  if (anchor.from.row < frozenRows) return "frozen-row";
  if (anchor.from.column < frozenColumns) return "frozen-column";
  return "body";
}

export interface SpreadsheetDrawingViewportPlacement {
  readonly region: "body" | "frozen-row" | "frozen-column";
  /** Position relative to the canvas or frozen-pane container that owns the drawing. */
  readonly left: number;
  readonly top: number;
  readonly visible: boolean;
}

export function placeSpreadsheetDrawing(input: {
  readonly anchor: SpreadsheetDrawingAnchor;
  readonly bounds: SpreadsheetDrawingBounds;
  readonly frozenRows: number;
  readonly frozenColumns: number;
  readonly frozenRowsHeight: number;
  readonly frozenColumnsWidth: number;
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly rowHeaderWidth: number;
  readonly columnHeaderHeight: number;
}): SpreadsheetDrawingViewportPlacement {
  const region = spreadsheetDrawingRegion(input.anchor, input.frozenRows, input.frozenColumns);
  let left: number;
  let top: number;
  let screenLeft: number;
  let screenTop: number;
  let clipLeft: number;
  let clipTop: number;
  let clipRight: number;
  let clipBottom: number;
  if (region === "body") {
    left = input.rowHeaderWidth + input.bounds.x;
    top = input.columnHeaderHeight + input.bounds.y;
    screenLeft = left - input.scrollLeft;
    screenTop = top - input.scrollTop;
    clipLeft = input.rowHeaderWidth + input.frozenColumnsWidth;
    clipTop = input.columnHeaderHeight + input.frozenRowsHeight;
    clipRight = input.viewportWidth;
    clipBottom = input.viewportHeight;
  } else if (region === "frozen-row") {
    const fixedColumn = input.anchor.kind !== "absolute" && input.anchor.from.column < input.frozenColumns;
    left = input.bounds.x - (fixedColumn ? 0 : input.scrollLeft);
    top = input.bounds.y;
    screenLeft = input.rowHeaderWidth + left;
    screenTop = input.columnHeaderHeight + top;
    clipLeft = input.rowHeaderWidth;
    clipTop = input.columnHeaderHeight;
    clipRight = input.viewportWidth;
    clipBottom = input.columnHeaderHeight + input.frozenRowsHeight;
  } else {
    left = input.bounds.x;
    top = input.bounds.y - input.scrollTop - input.frozenRowsHeight;
    screenLeft = input.rowHeaderWidth + left;
    screenTop = input.columnHeaderHeight + input.frozenRowsHeight + top;
    clipLeft = input.rowHeaderWidth;
    clipTop = input.columnHeaderHeight + input.frozenRowsHeight;
    clipRight = input.rowHeaderWidth + input.frozenColumnsWidth;
    clipBottom = input.viewportHeight;
  }
  const visible = screenLeft < clipRight && screenLeft + input.bounds.width > clipLeft &&
    screenTop < clipBottom && screenTop + input.bounds.height > clipTop;
  return Object.freeze({ region, left, top, visible });
}

export function frozenAxisExtent(geometry: SparseAxisGeometry, frozenCount: number): number {
  if (!Number.isSafeInteger(frozenCount) || frozenCount < 0) {
    throw new RangeError("Frozen axis count must be a non-negative integer.");
  }
  const last = Math.min(frozenCount, geometry.count);
  return last === 0 ? 0 : geometry.start(last) + geometry.size(last);
}

function includeFrozen(items: readonly VirtualGridItem[], geometry: SparseAxisGeometry, frozenCount: number): readonly VirtualGridItem[] {
  const byIndex = new Map(items.map((item) => [item.index, item]));
  for (let index = 1; index <= Math.min(frozenCount, geometry.count); index += 1) {
    const size = geometry.size(index);
    if (size > 0) byIndex.set(index, Object.freeze({ index, start: geometry.start(index), size }));
  }
  return Object.freeze([...byIndex.values()].sort((left, right) => left.index - right.index));
}
