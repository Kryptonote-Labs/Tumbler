import { latexFieldSource, latexFieldText } from './latex-metadata';
import { groupEnd, splice } from './latex-scan';

/** A cell's source, with the spacing around it kept so untouched cells stay as written. */
type Cell = { lead: string; body: string; trail: string };
/** One row: rules such as `\hline` before it, its cells, and the `\\` that ends it. */
type Row = { rules: string; cells: Cell[]; end: string };

export type LatexTabular = {
  /** Where the body between `\begin{tabular}{…}` and `\end{tabular}` is in the source. */
  start: number;
  end: number;
  spec: { start: number; end: number; columns: string[] };
  rows: Row[];
  /** Text after the last row, usually a closing rule. */
  tail: string;
  /** Rows and columns can be added and removed only when every row is a plain grid. */
  grid: boolean;
};

const rule =
  /^(?:\s*(?:\\(?:hline|toprule|midrule|bottomrule)\b|\\c(?:mid)?rule\s*(?:\([^)]*\))?\s*(?:\[[^\]]*\])?\s*\{[^}]*\}))+\s*/;

/** Split column specification tokens such as `l`, `p{3cm}` or `|`, or undefined for `*{…}`. */
function columnsOf(spec: string) {
  const columns: string[] = [];
  let decoration = '';
  for (let index = 0; index < spec.length;) {
    const char = spec[index]!;
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (char === '*') return;
    const takesGroup = /[pmbwX@!><]/.test(char);
    let end = index + 1;
    if (takesGroup) {
      while (spec[end] === ' ') end++;
      if (spec[end] === '{') end = groupEnd(spec, end);
      if (char === 'w' && spec[end] === '{') end = groupEnd(spec, end);
      if (end < 0) return;
    }
    const token = spec.slice(index, end);
    if (/^[lcrpmbwX]/.test(token)) {
      columns.push(decoration + token);
      decoration = '';
    } else if (columns.length) columns[columns.length - 1] += token;
    else decoration += token;
    index = end;
  }
  if (decoration && columns.length) columns[columns.length - 1] += decoration;
  return columns;
}

/** Split `text` at top-level occurrences of `separator`, outside groups and comments. */
function splitTop(text: string, separator: RegExp) {
  const parts: { text: string; separator: string }[] = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index < text.length; index++) {
    if (depth === 0) {
      separator.lastIndex = index;
      const match = separator.exec(text);
      if (match) {
        parts.push({ text: text.slice(from, index), separator: match[0] });
        from = index + match[0].length;
        index = from - 1;
        continue;
      }
    }
    const char = text[index];
    if (char === '\\') index++;
    else if (char === '{') depth++;
    else if (char === '}') depth--;
    else if (char === '%') {
      const line = text.indexOf('\n', index);
      index = line < 0 ? text.length : line;
    }
  }
  parts.push({ text: text.slice(from), separator: '' });
  return parts;
}

const rowEnd = /\\\\\*?(?:\s*\[[^\]]*\])?|\\tabularnewline\b/y;
const cellEnd = /&/y;

function cellOf(text: string): Cell {
  const lead = /^\s*/.exec(text)![0];
  const trail = /\s*$/.exec(text.slice(lead.length))![0];
  return { lead, body: text.slice(lead.length, text.length - trail.length), trail };
}

/** Read the first `tabular` in `source`, keeping the source of everything it does not model. */
export function readLatexTabular(source: string): LatexTabular | undefined {
  const begin = /\\begin\s*\{tabular\*?\}\s*(?:\[[^\]]*\]\s*)?\{/.exec(source);
  if (!begin) return;
  const open = begin.index + begin[0].length - 1;
  const specEnd = groupEnd(source, open);
  const close = source.indexOf('\\end{tabular', specEnd);
  if (specEnd < 0 || close < 0) return;
  const columns = columnsOf(source.slice(open + 1, specEnd - 1));
  const body = source.slice(specEnd, close);
  const pieces = splitTop(body, rowEnd);
  const last = pieces.at(-1)!;
  const rows: Row[] = [];
  let tail = '';
  for (const piece of pieces) {
    const rules = rule.exec(piece.text)?.[0] ?? /^\s*/.exec(piece.text)![0];
    const rest = piece.text.slice(rules.length);
    if (piece === last && !rest.trim()) {
      tail = piece.text;
      break;
    }
    rows.push({
      rules,
      cells: splitTop(rest, cellEnd).map((cell) => cellOf(cell.text)),
      end: piece.separator,
    });
  }
  const width = columns?.length;
  const grid =
    !!width &&
    rows.every(
      (row) =>
        row.cells.length === width &&
        !row.cells.some((cell) => /\\multi(?:column|row)\b/.test(cell.body)),
    );
  return {
    start: specEnd,
    end: close,
    spec: { start: open + 1, end: specEnd - 1, columns: columns ?? [] },
    rows,
    tail,
    grid,
  };
}

/** Text shown in a cell, or undefined when its TeX has to be edited as TeX. */
export const latexTableCellText = (cell: Cell) => latexFieldText(cell.body);

const rowSource = (row: Row) =>
  row.rules + row.cells.map((cell) => cell.lead + cell.body + cell.trail).join('&') + row.end;

/** Write a changed table back, leaving the source outside the tabular as it was. */
export function writeLatexTabular(source: string, table: LatexTabular) {
  const body = table.rows.map(rowSource).join('') + table.tail;
  const withBody = splice(source, table.start, table.end, body);
  return splice(withBody, table.spec.start, table.spec.end, table.spec.columns.join(''));
}

/** Set one cell from text, or from TeX when `tex`. */
export function setLatexTableCell(source: string, row: number, column: number, value: string, tex: boolean) {
  const table = readLatexTabular(source);
  const cell = table?.rows[row]?.cells[column];
  if (!table || !cell) return source;
  // A blank cell gets the usual ` & ` spacing; a written one keeps its own.
  if (!cell.body.trim()) {
    if (!column) table.rows[row]!.rules = table.rows[row]!.rules.replace(/(\n)[ \t]+$/, '$1');
    cell.lead = column ? ' ' : '';
    cell.trail = ' ';
  }
  cell.body = tex ? value : latexFieldSource(value);
  return writeLatexTabular(source, table);
}

const blankRow = (columns: number, end: string): Row => ({
  rules: '\n',
  cells: Array.from({ length: columns }, (_, index) => ({
    lead: index ? ' ' : '',
    body: '',
    trail: ' ',
  })),
  end,
});

/** Add an empty row before or after `row`. */
export function insertLatexTableRow(source: string, row: number, after: boolean) {
  const table = readLatexTabular(source);
  if (!table?.grid) return source;
  const at = Math.min(table.rows.length, row + (after ? 1 : 0));
  const template = table.rows[Math.min(row, table.rows.length - 1)];
  const end = template?.end || '\\\\';
  // The last row may have no `\\`; give it one so the new row starts on a row of its own.
  const lastRow = table.rows.at(-1);
  if (lastRow && !lastRow.end) lastRow.end = ' \\\\';
  table.rows.splice(
    at,
    0,
    blankRow(table.spec.columns.length, end.startsWith(' ') ? end : ' ' + end),
  );
  return writeLatexTabular(source, table);
}

/** Remove a row, keeping the rules above it for the row that takes its place. */
export function deleteLatexTableRow(source: string, row: number) {
  const table = readLatexTabular(source);
  const removed = table?.rows[row];
  if (!table?.grid || !removed || table.rows.length < 2) return source;
  table.rows.splice(row, 1);
  const next = table.rows[row];
  if (next && removed.rules.trim() && !next.rules.trim()) next.rules = removed.rules;
  return writeLatexTabular(source, table);
}

/** Add an empty column before or after `column`, aligned like the column beside it. */
export function insertLatexTableColumn(source: string, column: number, after: boolean) {
  const table = readLatexTabular(source);
  if (!table?.grid) return source;
  const at = column + (after ? 1 : 0);
  const like = table.spec.columns[column]!.replace(/[|]+/g, '').replace(/^[@!<>]\{[^}]*\}/, '');
  table.spec.columns.splice(at, 0, /^[lcr]/.test(like) ? like[0]! : like);
  for (const row of table.rows) row.cells.splice(at, 0, { lead: ' ', body: '', trail: ' ' });
  return writeLatexTabular(source, table);
}

/** Remove a column and its cells. */
export function deleteLatexTableColumn(source: string, column: number) {
  const table = readLatexTabular(source);
  if (!table?.grid || table.spec.columns.length < 2) return source;
  table.spec.columns.splice(column, 1);
  for (const row of table.rows) row.cells.splice(column, 1);
  return writeLatexTabular(source, table);
}

/** A new table with a header row, ready for a caption. */
export function latexTableSource(rows = 3, columns = 3) {
  const row = (text: string) => Array.from({ length: columns }, () => text).join(' & ') + ' \\\\';
  return [
    '\\begin{table}[htbp]',
    '\\centering',
    '\\begin{tabular}{' + 'l'.repeat(columns) + '}',
    '\\hline',
    row(''),
    '\\hline',
    ...Array.from({ length: rows - 1 }, () => row('')),
    '\\hline',
    '\\end{tabular}',
    '\\end{table}',
  ].join('\n');
}
