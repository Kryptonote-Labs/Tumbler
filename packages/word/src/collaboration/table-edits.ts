import type * as Y from 'yjs';
import { tableParagraphs, MAX_TABLE_COLUMNS, type TableCell } from './tables.ts';

export const TABLE_ACTIONS = [
  'row-before',
  'row-after',
  'column-before',
  'column-after',
  'delete-row',
  'delete-column',
  'delete-table',
  'clear-cell',
] as const;
export type TableAction = (typeof TABLE_ACTIONS)[number];
type Delta = Parameters<Y.Text['applyDelta']>[0];

/** Retain existing characters so other authors' text and undo identities survive structural edits. */
export function editTableDelta(
  text: Y.Text,
  at: number,
  action: TableAction,
  tableId: string,
  cellId: string,
): Delta {
  if (!TABLE_ACTIONS.includes(action)) throw new Error('Unknown table operation.');
  const paragraphs = tableParagraphs(text);
  const target = paragraphs.find((p) => p.start <= at && at < p.end)?.table;
  if (!target || target.id !== tableId || target.cell !== cellId)
    throw new Error('The table cell changed. Read the document again.');
  const table = paragraphs.flatMap((p) => {
    const cell =
      p.table?.id === target.id
        ? p.table
        : p.table?.parents?.find((parent) => parent.id === target.id);
    return cell ? [{ ...p, table: cell }] : [];
  });
  const replaceCell = (start: number, cell: TableCell) => {
    const original = paragraphs.find((p) => p.start === start)!.table!;
    return original.id === target.id
      ? cell
      : {
          ...original,
          parents: original.parents!.map((parent) => (parent.id === target.id ? cell : parent)),
        };
  };
  const cells: { start: number; end: number; table: TableCell }[] = [];
  for (const p of table) {
    if (cells.at(-1)?.table.cell === p.table!.cell) cells.at(-1)!.end = p.end;
    else cells.push({ start: p.start, end: p.end, table: p.table! });
  }
  const rows = [...new Set(cells.map((c) => c.table.row))];
  const current = cells.find((c) => c.table.cell === target.cell)!;
  const removesTable =
    action === 'delete-table' ||
    (action === 'delete-row' && rows.length === 1) ||
    (action === 'delete-column' && target.columns === 1);
  const changes: { start: number; end: number; delta: Delta }[] = [];
  const remove = (start: number, end: number) => {
    if (end > start) changes.push({ start, end, delta: [{ delete: end - start }] });
  };
  if (removesTable) remove(cells[0]!.start, cells.at(-1)!.end);
  else if (action === 'clear-cell') remove(current.start, current.end - 1);
  else if (action === 'delete-row') {
    for (const cell of cells.filter((c) => c.table.row === target.row)) {
      remove(cell.start, cell.end);
      if (cell.table.merge !== 'restart') continue;
      const nextRow = rows[rows.indexOf(target.row) + 1];
      for (const p of table.filter(
        (p) =>
          p.table!.row === nextRow &&
          p.table!.column === cell.table.column &&
          p.table!.merge === 'continue',
      ))
        changes.push({
          start: p.end - 1,
          end: p.end,
          delta: [
            {
              retain: 1,
              attributes: { table: replaceCell(p.start, { ...p.table!, merge: 'restart' }) },
            },
          ],
        });
    }
  } else if (action === 'row-before' || action === 'row-after') {
    const row = crypto.randomUUID();
    const selected = cells.filter((c) => c.table.row === target.row);
    const start = action === 'row-before' ? selected[0]!.start : selected.at(-1)!.end;
    const nextRow = rows[rows.indexOf(target.row) + (action === 'row-after' ? 1 : 0)];
    const continuing = cells.filter((c) => c.table.row === nextRow && c.table.merge === 'continue');
    const inserted: { column: number; span?: number; merge?: 'continue' }[] = [];
    for (let column = 0; column < target.columns;) {
      const span = continuing.find((c) => c.table.column === column)?.table.span;
      const merged = continuing.some((c) => c.table.column === column);
      inserted.push({ column, ...(merged ? { span: span ?? 1, merge: 'continue' } : {}) });
      column += merged ? (span ?? 1) : 1;
    }
    changes.push({
      start,
      end: start,
      delta: inserted.map(({ column, ...merge }) => ({
        insert: '\n',
        attributes: {
          table: {
            id: target.id,
            row,
            cell: crypto.randomUUID(),
            column,
            ...merge,
            ...(target.before !== undefined || target.after !== undefined
              ? { before: 0, after: 0 }
              : {}),
            columns: target.columns,
            ...(target.widths ? { widths: target.widths } : {}),
            ...(target.parents ? { parents: target.parents } : {}),
            ...(target.source ? { source: { table: target.source.table } } : {}),
          },
        },
      })),
    });
  } else {
    const deleting = action === 'delete-column';
    const columns = target.columns + (deleting ? -1 : 1);
    if (columns > MAX_TABLE_COLUMNS) throw new Error('Word tables support up to 63 columns.');
    const column = target.column + (action === 'column-after' ? (target.span ?? 1) : 0);
    const widths = target.widths?.length
      ? Array.from({ length: columns }, () => target.widths!.reduce((a, b) => a + b, 0) / columns)
      : undefined;
    const covers = (cell: TableCell) =>
      cell.column <= column && cell.column + (cell.span ?? 1) > column;
    if (deleting) {
      for (const cell of cells.filter((c) => covers(c.table) && (c.table.span ?? 1) === 1))
        remove(cell.start, cell.end);
    } else {
      for (const row of rows) {
        const rowCells = cells.filter((c) => c.table.row === row);
        const first = rowCells[0]!.table;
        const endColumn = target.columns - (first.after ?? 0);
        if (column < (first.before ?? 0) || ((first.after ?? 0) > 0 && column >= endColumn))
          continue;
        // A column inserted inside a merged cell extends that cell's span.
        if (rowCells.some((c) => c.table.column < column && covers(c.table))) continue;
        const start = rowCells.find((c) => c.table.column >= column)?.start ?? rowCells.at(-1)!.end;
        changes.push({
          start,
          end: start,
          delta: [
            {
              insert: '\n',
              attributes: {
                table: {
                  id: target.id,
                  row,
                  cell: crypto.randomUUID(),
                  column,
                  columns,
                  ...(first.before !== undefined || first.after !== undefined
                    ? { before: first.before ?? 0, after: first.after ?? 0 }
                    : {}),
                  ...(widths ? { widths } : {}),
                  ...(target.parents ? { parents: target.parents } : {}),
                  ...(target.source
                    ? {
                        source: {
                          table: target.source.table,
                          row: rowCells[0]?.table.source?.row,
                        },
                      }
                    : {}),
                },
              },
            },
          ],
        });
      }
    }
    for (const p of table) {
      const old = p.table!;
      const span = old.span ?? 1;
      if (deleting && covers(old) && span === 1) continue;
      const changedSpan =
        deleting && covers(old)
          ? span - 1
          : !deleting && old.column < column && covers(old)
            ? span + 1
            : span;
      changes.push({
        start: p.end - 1,
        end: p.end,
        delta: [
          {
            retain: 1,
            attributes: {
              table: replaceCell(p.start, {
                ...old,
                columns,
                ...(old.before !== undefined
                  ? { before: old.before + (column < old.before ? (deleting ? -1 : 1) : 0) }
                  : {}),
                ...(old.after !== undefined
                  ? {
                      after:
                        old.after +
                        (old.after > 0 && column >= old.columns - old.after
                          ? deleting
                            ? -1
                            : 1
                          : 0),
                    }
                  : {}),
                column:
                  old.column >= column
                    ? deleting && old.column === column
                      ? column
                      : old.column + (deleting ? -1 : 1)
                    : old.column,
                ...(widths ? { widths } : {}),
                ...(old.span !== undefined || changedSpan !== 1 ? { span: changedSpan } : {}),
              }),
            },
          },
        ],
      });
    }
  }
  changes.sort((a, b) => a.start - b.start || a.end - b.end);
  const delta: Delta = [];
  let offset = 0;
  for (const change of changes) {
    if (change.start < offset) throw new Error('Overlapping table edits.');
    if (change.start > offset) delta.push({ retain: change.start - offset });
    delta.push(...change.delta);
    offset = change.end;
  }
  // Keep a terminal ordinary paragraph when deleting a table at the document's end.
  if (removesTable && cells.at(-1)!.end === text.length)
    delta.push({ insert: '\n', attributes: {} });
  return delta;
}
