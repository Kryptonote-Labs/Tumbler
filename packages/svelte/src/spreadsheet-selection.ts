import type { GridRange } from "@tumblerjs/core";

type Axis = {
  start(index: number): number;
  size(index: number): number;
  count: number;
};
/** Clip the range outline separately in each frozen/scrolling pane without drawing internal seams. */
export function spreadsheetSelectionRects(input: {
  range: GridRange;
  rows: Axis;
  columns: Axis;
  scrollTop: number;
  scrollLeft: number;
  width: number;
  height: number;
  frozenRows: number;
  frozenColumns: number;
}) {
  const {
    range,
    rows,
    columns,
    scrollTop,
    scrollLeft,
    width,
    height,
    frozenRows,
    frozenColumns,
  } = input;
  const rowSplit = frozenRows
    ? rows.start(frozenRows) + rows.size(frozenRows)
    : 0;
  const columnSplit = frozenColumns
    ? columns.start(frozenColumns) + columns.size(frozenColumns)
    : 0;
  const result: {
    left: number;
    top: number;
    width: number;
    height: number;
    topEdge: boolean;
    bottomEdge: boolean;
    leftEdge: boolean;
    rightEdge: boolean;
  }[] = [];
  for (const fixedRow of [true, false])
    for (const fixedColumn of [true, false]) {
      const startRow = Math.max(range.start.row, fixedRow ? 1 : frozenRows + 1);
      const endRow = Math.min(
        range.end.row,
        fixedRow ? frozenRows : rows.count,
      );
      const startColumn = Math.max(
        range.start.column,
        fixedColumn ? 1 : frozenColumns + 1,
      );
      const endColumn = Math.min(
        range.end.column,
        fixedColumn ? frozenColumns : columns.count,
      );
      if (startRow > endRow || startColumn > endColumn) continue;
      const left =
        52 + columns.start(startColumn) - (fixedColumn ? 0 : scrollLeft);
      const top = 28 + rows.start(startRow) - (fixedRow ? 0 : scrollTop);
      const right =
        52 +
        columns.start(endColumn) +
        columns.size(endColumn) -
        (fixedColumn ? 0 : scrollLeft);
      const bottom =
        28 +
        rows.start(endRow) +
        rows.size(endRow) -
        (fixedRow ? 0 : scrollTop);
      const clippedLeft = Math.max(left, 52 + (fixedColumn ? 0 : columnSplit));
      const clippedTop = Math.max(top, 28 + (fixedRow ? 0 : rowSplit));
      const clippedRight = Math.min(
        right,
        fixedColumn ? 52 + columnSplit : width,
      );
      const clippedBottom = Math.min(bottom, fixedRow ? 28 + rowSplit : height);
      if (clippedLeft >= clippedRight || clippedTop >= clippedBottom) continue;
      result.push({
        left: clippedLeft,
        top: clippedTop,
        width: clippedRight - clippedLeft,
        height: clippedBottom - clippedTop,
        leftEdge: startColumn === range.start.column && left === clippedLeft,
        rightEdge: endColumn === range.end.column && right === clippedRight,
        topEdge: startRow === range.start.row && top === clippedTop,
        bottomEdge: endRow === range.end.row && bottom === clippedBottom,
      });
    }
  return result;
}

/** Map source-row selections to visible row runs when a table is sorted or filtered. */
export function spreadsheetSelectionRanges(
  range: GridRange,
  projected: ReadonlyMap<number, number | undefined>,
): GridRange[] {
  if (!projected.size) return [range];
  const intervals: { start: number; end: number }[] = [];
  let cursor = range.start.row;
  for (const visual of [...projected.keys()].sort((a, b) => a - b)) {
    if (visual < cursor) continue;
    if (visual > range.end.row) break;
    if (cursor < visual) intervals.push({ start: cursor, end: visual - 1 });
    cursor = visual + 1;
  }
  if (cursor <= range.end.row)
    intervals.push({ start: cursor, end: range.end.row });
  for (const [visual, source] of projected)
    if (
      source !== undefined &&
      source >= range.start.row &&
      source <= range.end.row
    )
      intervals.push({ start: visual, end: visual });
  const runs: typeof intervals = [];
  for (const interval of intervals.sort((a, b) => a.start - b.start)) {
    const last = runs.at(-1);
    if (last && interval.start <= last.end + 1)
      last.end = Math.max(last.end, interval.end);
    else runs.push({ ...interval });
  }
  return runs.map((run) => ({
    start: { row: run.start, column: range.start.column },
    end: { row: run.end, column: range.end.column },
  }));
}
