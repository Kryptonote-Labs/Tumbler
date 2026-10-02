import type { WordContentCell } from './create-content.ts';

/** Resolve physical cells onto a shared column grid, including horizontal and vertical merges. */
export function authoredTableGrid(
  rows: readonly (readonly WordContentCell[])[],
  columnWidths: readonly number[] | undefined,
  width: number,
  rowGrids?: readonly { before: number; after: number }[],
) {
  const columns =
    columnWidths?.length ||
    (rowGrids?.[0]?.before ?? 0) +
      (rowGrids?.[0]?.after ?? 0) +
      (rows[0]?.reduce((sum, cell) => sum + (cell.gridSpan ?? 1), 0) ?? 0);
  if (
    !columns ||
    columns > 63 ||
    rows.some(
      (row, index) =>
        !row.length ||
        row.length > 63 ||
        (rowGrids
          ? (rowGrids[index]?.before ?? 0) +
              (rowGrids[index]?.after ?? 0) +
              row.reduce((sum, cell) => sum + (cell.gridSpan ?? 1), 0) >
            columns
          : row.reduce((sum, cell) => sum + (cell.gridSpan ?? 1), 0) !== columns),
    )
  )
    throw new RangeError('Word table cells need a consistent grid of one to 63 columns.');
  const widths = columnWidths?.length ? columnWidths : Array.from({ length: columns }, () => width / columns);
  if (
    widths.length !== columns ||
    widths.some((value) => !Number.isFinite(value) || value <= 0)
  )
    throw new RangeError('Invalid table column widths.');
  return {
    widths,
    rowGrids: rows.map((_, index) => rowGrids?.[index] ?? { before: 0, after: 0 }),
    rows: rows.map((row, index) => {
      let column = rowGrids?.[index]?.before ?? 0;
      return row.map((cell) => {
        const span = cell.gridSpan ?? 1;
        if (
          !Number.isInteger(span) ||
          span < 1 ||
          (cell.verticalMerge !== undefined &&
            !['restart', 'continue'].includes(cell.verticalMerge))
        )
          throw new RangeError('Invalid table cell span.');
        const result = {
          cell,
          column,
          span,
          width: widths.slice(column, column + span).reduce((a, b) => a + b, 0),
        };
        column += span;
        return result;
      });
    }),
  };
}
