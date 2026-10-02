import type * as Y from 'yjs';

// Word rejects DOCX rows with more than 63 cells (MS-OI29500 §17.4.78).
export const MAX_TABLE_COLUMNS = 63;

export type TableCell = {
  id: string;
  row: string;
  cell: string;
  column: number;
  columns: number;
  widths?: number[];
  before?: number;
  after?: number;
  span?: number;
  merge?: 'restart' | 'continue';
  source?: {
    table: number;
    row?: number;
    cell?: number;
  };
  parents?: TableCell[];
};
export function isTableCell(value: unknown): value is TableCell {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (
    ['id', 'row', 'cell'].every((key) => {
      const id: unknown = Reflect.get(value, key);
      return typeof id === 'string' && /^[\w-]{1,100}$/.test(id);
    }) &&
    'column' in value &&
    typeof value.column === 'number' &&
    Number.isInteger(value.column) &&
    value.column >= 0 &&
    'columns' in value &&
    typeof value.columns === 'number' &&
    Number.isInteger(value.columns) &&
    value.columns >= 1 &&
    value.columns <= MAX_TABLE_COLUMNS &&
    value.column < value.columns &&
    Object.keys(value).every((key) =>
      [
        'id',
        'row',
        'cell',
        'column',
        'columns',
        'source',
        'parents',
        'widths',
        'span',
        'merge',
        'before',
        'after',
      ].includes(key),
    ) &&
    ['before', 'after'].every(
      (key) =>
        !(key in value) ||
        (Number.isSafeInteger(Reflect.get(value, key)) &&
          Reflect.get(value, key) >= 0 &&
          Reflect.get(value, key) <= Number(value.columns)),
    ) &&
    (!('widths' in value) ||
      (Array.isArray(value.widths) &&
        value.widths.every(
          (width) => typeof width === 'number' && Number.isFinite(width) && width >= 0,
        ))) &&
    (!('span' in value) ||
      (typeof value.span === 'number' &&
        Number.isInteger(value.span) &&
        value.span >= 1 &&
        value.column + value.span <= value.columns)) &&
    (!('merge' in value) || value.merge === 'restart' || value.merge === 'continue') &&
    (!('source' in value) || isTableSource(value.source)) &&
    (!('parents' in value) || (Array.isArray(value.parents) && value.parents.every(isTableCell)))
  );
}

export function tableParagraphs(text: Y.Text) {
  const result: { start: number; end: number; table?: TableCell }[] = [];
  let start = 0,
    offset = 0;
  for (const part of text.toDelta()) {
    if (typeof part.insert !== 'string') continue;
    for (let i = 0; i < part.insert.length; i++) {
      if (part.insert[i] === '\n') {
        result.push({ start, end: offset + i + 1, table: part.attributes?.table });
        start = offset + i + 1;
      }
    }
    offset += part.insert.length;
  }
  return result;
}

function isTableSource(value: unknown): value is NonNullable<TableCell['source']> {
  if (!value || typeof value !== 'object') return false;
  const source = value as Record<string, unknown>;
  return (
    ['table'].every((key) => Number.isSafeInteger(source[key]) && Number(source[key]) > 0) &&
    ['row', 'cell'].every(
      (key) =>
        source[key] === undefined || (Number.isSafeInteger(source[key]) && Number(source[key]) > 0),
    ) &&
    Object.keys(source).every((key) => ['table', 'row', 'cell'].includes(key))
  );
}

export type GroupedTable<T> = {
  kind: 'table';
  id: string;
  source?: number;
  rowSources?: (number | undefined)[];
  columnWidths?: number[];
  rowGrids?: { before: number; after: number }[];
  rows: {
    source?: number;
    gridSpan?: number;
    verticalMerge?: 'restart' | 'continue';
    blocks: (T | GroupedTable<T>)[];
  }[][];
};

/** Paragraph boundaries retain the full table ancestry, including merged and nested cells. */
export function groupTableParagraphs<T extends { table?: TableCell }>(
  paragraphs: readonly T[],
): (T | GroupedTable<T>)[] {
  const seen = new Set<string>();
  const visit = (input: readonly T[], depth: number): (T | GroupedTable<T>)[] => {
    const result: (T | GroupedTable<T>)[] = [];
    const location = (p: T) => (p.table ? [...(p.table.parents ?? []), p.table][depth] : undefined);
    for (let i = 0; i < input.length;) {
      const cell = location(input[i]!);
      if (!cell) {
        result.push(input[i++]!);
        continue;
      }
      if (seen.has(cell.id)) throw new Error('A table must be contiguous.');
      seen.add(cell.id);
      const table: GroupedTable<T> = {
        kind: 'table',
        id: cell.id,
        rows: [],
        ...(cell.before !== undefined || cell.after !== undefined ? { rowGrids: [] } : {}),
        ...(cell.widths?.length ? { columnWidths: cell.widths } : {}),
        ...(cell.source ? { source: cell.source.table, rowSources: [] } : {}),
      };
      result.push(table);
      let rowId: string | undefined;
      let column = 0;
      while (i < input.length && location(input[i]!)?.id === cell.id) {
        const current = location(input[i]!)!;
        if (current.row !== rowId) {
          if (
            rowId !== undefined &&
            (table.rowGrids ? column > cell.columns : column !== cell.columns)
          )
            throw new Error('A table row is incomplete.');
          table.rows.push([]);
          table.rowSources?.push(current.source?.row);
          table.rowGrids?.push({ before: current.before ?? 0, after: current.after ?? 0 });
          rowId = current.row;
          column = current.before ?? 0;
        }
        if (current.column !== column || current.columns !== cell.columns)
          throw new Error('Table cells are out of order.');
        const start = i;
        while (
          i < input.length &&
          location(input[i]!)?.cell === current.cell &&
          location(input[i]!)?.id === current.id &&
          location(input[i]!)?.row === current.row
        ) {
          const item = location(input[i]!)!;
          if (
            item.column !== current.column ||
            item.columns !== current.columns ||
            item.span !== current.span
          )
            throw new Error('Cell structure does not agree.');
          i++;
        }
        table.rows.at(-1)!.push({
          blocks: visit(input.slice(start, i), depth + 1),
          ...(current.span ? { gridSpan: current.span } : {}),
          ...(current.merge ? { verticalMerge: current.merge } : {}),
          ...(current.source
            ? {
                source: current.source.cell,
              }
            : {}),
        });
        column += current.span ?? 1;
      }
      if (table.rowGrids ? column > cell.columns : column !== cell.columns)
        throw new Error('A table row is incomplete.');
    }
    return result;
  };
  return visit(paragraphs, 0);
}

export function protectTableBoundaries(text: Y.Text, start: number, end: number) {
  if (start === end) return;
  const paragraphs = tableParagraphs(text);
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i]!;
    if (paragraph.end - 1 < start || paragraph.end - 1 >= end) continue;
    const next = paragraphs[i + 1];
    if (paragraph.table?.cell === next?.table?.cell) continue;
    const id = paragraph.table?.id ?? next?.table?.id;
    if (!id) continue;
    const table = paragraphs.filter((item) => item.table?.id === id);
    if (start <= table[0]!.start && end >= table.at(-1)!.end) continue;
    throw new Error('Select text within a cell, or select the whole table.');
  }
}

export function insertTableDelta(text: Y.Text, end: number, rows: readonly (readonly string[])[]) {
  const columns = rows[0]?.length ?? 0;
  if (
    !rows.length ||
    columns < 1 ||
    columns > MAX_TABLE_COLUMNS ||
    rows.some((row) => row.length !== columns)
  )
    throw new Error('Use a rectangular table with 1 to 63 columns.');
  const paragraph = tableParagraphs(text).find(
    (paragraph) => paragraph.start <= end && end < paragraph.end,
  );
  if (paragraph?.table) throw new Error('Insert tables outside existing cells.');
  const value = text.toString();
  const newline = value.indexOf('\n', end);
  const start = newline < 0 ? text.length : newline + 1;
  const delta: Parameters<Y.Text['applyDelta']>[0] = start ? [{ retain: start }] : [];
  if (newline < 0 && value && !value.endsWith('\n')) delta.push({ insert: '\n', attributes: {} });
  const id = crypto.randomUUID();
  for (const values of rows) {
    const row = crypto.randomUUID();
    values.forEach((value, column) => {
      const table = { id, row, cell: crypto.randomUUID(), column, columns };
      for (const line of value.replace(/\r\n?/g, '\n').split('\n')) {
        if (line) delta.push({ insert: line, attributes: {} });
        delta.push({ insert: '\n', attributes: { table } });
      }
    });
  }
  if (start >= text.length) delta.push({ insert: '\n', attributes: {} });
  return { delta, start: start + (newline < 0 && value && !value.endsWith('\n') ? 1 : 0) };
}
