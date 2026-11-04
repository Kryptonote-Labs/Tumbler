import type { PresentationCommand } from './commands.ts';
import type { SlideTable, SlideTableCell, SlideText } from './model.ts';
import { nativeObjectText } from './native-shape.ts';

/** Anchor rectangles preserve merged cells and their text across native structural edits. */
export function editNativeTable(
  table: SlideTable,
  input: Extract<PresentationCommand, { name: 'edit-table' }>,
): SlideTable {
  const rowCount = Math.max(...table.cells.map((c) => c.row + c.rowSpan)),
    columnCount = Math.max(...table.cells.map((c) => c.column + c.columnSpan));
  const x = Array.from(
    { length: columnCount + 1 },
    (_, i) => table.cells.find((c) => c.column === i)?.x ?? (i === columnCount ? table.width : 0),
  );
  const y = Array.from(
    { length: rowCount + 1 },
    (_, i) => table.cells.find((c) => c.row === i)?.y ?? (i === rowCount ? table.height : 0),
  );
  const widths = table.columnWidths
      ? [...table.columnWidths]
      : x.slice(1).map((end, i) => end - x[i]!),
    heights = table.rowHeights ? [...table.rowHeights] : y.slice(1).map((end, i) => end - y[i]!);
  if (
    input.row >= rowCount + (input.action === 'insert-row' ? 1 : 0) ||
    input.column >= columnCount + (input.action === 'insert-column' ? 1 : 0)
  )
    throw new RangeError('Table cell is outside the grid.');
  let cells = [...table.cells];
  const isRow = input.action.endsWith('row'),
    isColumn = input.action.endsWith('column');
  if (isRow || isColumn) {
    const insert = input.action.startsWith('insert'),
      sizes = isRow ? heights : widths,
      index = isRow ? input.row : input.column;
    if (!insert && sizes.length === 1) throw new Error('Keep at least one table row and column.');
    if (insert) sizes.splice(index, 0, sizes[Math.min(index, sizes.length - 1)]!);
    else sizes.splice(index, 1);
    cells = cells.flatMap((cell) => {
      const start = isRow ? cell.row : cell.column,
        span = isRow ? cell.rowSpan : cell.columnSpan;
      let next = start,
        size = span;
      if (insert) {
        if (index <= start) next++;
        else if (index < start + span) size++;
      } else {
        if (index < start) next--;
        else if (index < start + span) size--;
      }
      return size
        ? [
            {
              ...cell,
              ...(isRow ? { row: next, rowSpan: size } : { column: next, columnSpan: size }),
            },
          ]
        : [];
    });
  } else if (input.action === 'merge') {
    const bottom = input.endRow ?? input.row,
      right = input.endColumn ?? input.column;
    if (bottom < input.row || right < input.column || bottom >= rowCount || right >= columnCount)
      throw new RangeError('Invalid table merge range.');
    const selected = cells.filter(
      (c) =>
        c.row <= bottom &&
        c.column <= right &&
        c.row + c.rowSpan > input.row &&
        c.column + c.columnSpan > input.column,
    );
    if (
      selected.some(
        (c) =>
          c.row < input.row ||
          c.column < input.column ||
          c.row + c.rowSpan - 1 > bottom ||
          c.column + c.columnSpan - 1 > right,
      )
    )
      throw new Error('Select complete merged cells.');
    const anchor = selected.find((c) => c.row === input.row && c.column === input.column)!;
    const text: SlideText = {
      ...(anchor.text ?? nativeObjectText()),
      paragraphs: selected.flatMap((c) => c.text?.paragraphs ?? []),
    };
    cells = cells.filter((c) => !selected.includes(c));
    cells.push({
      ...anchor,
      rowSpan: bottom - input.row + 1,
      columnSpan: right - input.column + 1,
      text,
    });
  } else {
    const anchor = cells.find(
      (c) =>
        input.row >= c.row &&
        input.column >= c.column &&
        input.row < c.row + c.rowSpan &&
        input.column < c.column + c.columnSpan,
    );
    if (!anchor) throw new Error('Table cell not found.');
    cells = cells.map((c) => (c === anchor ? { ...c, rowSpan: 1, columnSpan: 1 } : c));
  }
  for (let row = 0; row < heights.length; row++)
    for (let column = 0; column < widths.length; column++) {
      if (
        cells.some(
          (c) =>
            row >= c.row &&
            column >= c.column &&
            row < c.row + c.rowSpan &&
            column < c.column + c.columnSpan,
        )
      )
        continue;
      const template =
        table.cells.find(
          (c) =>
            c.row === Math.min(row, rowCount - 1) && c.column === Math.min(column, columnCount - 1),
        ) ?? table.cells[0]!;
      cells.push({
        ...template,
        elementId: -cells.length - 1,
        row,
        column,
        rowSpan: 1,
        columnSpan: 1,
        text: nativeObjectText('', 18),
      });
    }
  const totalW = widths.reduce((n, w) => n + w, 0),
    totalH = heights.reduce((n, h) => n + h, 0);
  return {
    ...table,
    width: totalW,
    height: totalH,
    columnWidths: widths,
    rowHeights: heights,
    cells: cells
      .map((c): SlideTableCell => ({
        ...c,
        x: widths.slice(0, c.column).reduce((n, w) => n + w, 0),
        y: heights.slice(0, c.row).reduce((n, h) => n + h, 0),
        width: widths.slice(c.column, c.column + c.columnSpan).reduce((n, w) => n + w, 0),
        height: heights.slice(c.row, c.row + c.rowSpan).reduce((n, h) => n + h, 0),
      }))
      .sort((a, b) => a.row - b.row || a.column - b.column),
  };
}
