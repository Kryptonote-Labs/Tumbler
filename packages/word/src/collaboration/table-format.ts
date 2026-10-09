import type * as Y from 'yjs';
import { isWordCellFormat, isWordRowFormat, type WordCellFormat, type WordRowFormat } from '../table-format.ts';
import { tableParagraphs } from './tables.ts';
export interface WordTableFormatPatch {
  readonly scope: 'cell' | 'row' | 'column' | 'table';
  readonly cell?: WordCellFormat;
  readonly row?: WordRowFormat;
  readonly columnWidths?: readonly number[];
}
/** Change paragraph-boundary metadata, preserving text identities and ordinary collaborative undo. */
export function formatTableDelta(text: Y.Text, at: number, tableId: string, cellId: string, patch: WordTableFormatPatch): Parameters<Y.Text['applyDelta']>[0] {
  if (!patch || !['cell', 'row', 'column', 'table'].includes(patch.scope) || Object.keys(patch).some(k => !['scope', 'cell', 'row', 'columnWidths'].includes(k)) ||
    patch.cell !== undefined && !isWordCellFormat(patch.cell) || patch.row !== undefined && !isWordRowFormat(patch.row)) throw new TypeError('Invalid table formatting.');
  const paragraphs = tableParagraphs(text);
  const target = paragraphs.find(p => p.start <= at && at < p.end)?.table;
  if (!target || target.id !== tableId || target.cell !== cellId) throw new Error('The table cell changed. Read the document again.');
  if (patch.columnWidths && (patch.columnWidths.length !== target.columns || !patch.columnWidths.every(w => Number.isFinite(w) && w > 0))) throw new RangeError('Provide one positive width per grid column.');
  const delta: Parameters<Y.Text['applyDelta']>[0] = [];
  let offset = 0;
  for (const p of paragraphs) {
    const original = p.table;
    const cell = original?.id === tableId ? original : original?.parents?.find(t => t.id === tableId);
    if (!original || !cell) continue;
    const selected = patch.scope === 'table' || (patch.scope === 'row' ? cell.row === target.row : patch.scope === 'column'
      ? cell.column < target.column + (target.span ?? 1) && cell.column + (cell.span ?? 1) > target.column : cell.cell === target.cell);
    const rowSelected = patch.row && (patch.scope === 'table' || cell.row === target.row);
    if (!selected && !patch.columnWidths && !rowSelected) continue;
    const updated = { ...cell,
      ...(selected && patch.cell ? { format: { ...cell.format, ...patch.cell, ...(patch.cell.borders ? { borders: { ...cell.format?.borders, ...patch.cell.borders } } : {}) } } : {}),
      ...(rowSelected ? { rowFormat: { ...cell.rowFormat, ...patch.row } } : {}),
      ...(patch.columnWidths ? { widths: [...patch.columnWidths] } : {}),
    };
    if (p.end - 1 > offset) delta.push({ retain: p.end - 1 - offset });
    delta.push({ retain: 1, attributes: { table: original.id === tableId ? updated : { ...original, parents: original.parents!.map(t => t.id === tableId ? updated : t) } } });
    offset = p.end;
  }
  return delta;
}
