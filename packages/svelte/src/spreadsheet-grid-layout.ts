import type { SparseAxisGeometry } from "@tumbler/core";
import type { CellRange } from "@tumbler/sheets";
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

function includeFrozen(items: readonly VirtualGridItem[], geometry: SparseAxisGeometry, frozenCount: number): readonly VirtualGridItem[] {
  const byIndex = new Map(items.map((item) => [item.index, item]));
  for (let index = 1; index <= Math.min(frozenCount, geometry.count); index += 1) {
    const size = geometry.size(index);
    if (size > 0) byIndex.set(index, Object.freeze({ index, start: geometry.start(index), size }));
  }
  return Object.freeze([...byIndex.values()].sort((left, right) => left.index - right.index));
}
