import { readLatexCellSpan } from './latex-table-grid';
import { latexFieldSource, latexFieldText } from './latex-metadata';
import { measureLatexRoman } from './latex-font-metrics';
import type { LatexTypography } from './latex-typography';
import { argumentAt, commandEnd, environmentAt, groupAt, latexCommands, lineEnd, verbatimEnd, whitespaceEnd } from './latex-syntax';
import { groupEnd, splice } from './latex-scan';

/** A cell's source, with the spacing around it kept so untouched cells stay as written. */
type Cell = { lead: string; body: string; trail: string };
/** One row: rules such as `\hline` before it, its cells, and the `\\` that ends it. */
type Row = { rules: string; cells: Cell[]; end: string };
type TableSection = 'firstHead' | 'head' | 'foot' | 'lastFoot' | 'body';

type TableRows = { rows: number[]; tail: string; present: boolean };

type TableLayout =
  | { kind: 'fixed'; caption: boolean }
  | { kind: 'continuing'; sections: Record<TableSection, TableRows> };

const sectionEnds = /\\end(?:firsthead|head|foot|lastfoot)\b/y;
const sectionOf = new Map<string, TableSection>([
  ['\\endfirsthead', 'firstHead'],
  ['\\endhead', 'head'],
  ['\\endfoot', 'foot'],
  ['\\endlastfoot', 'lastFoot'],
]);


export type LatexTabular = {
  /** Where the body between `\begin{tabular}{…}` and `\end{tabular}` is in the source. */
  start: number;
  end: number;
  spec: { start: number; end: number; columns: string[]; width?: string; columnSeparation?: string; rowStretch?: number };
  rows: Row[];
  layout: TableLayout;
  rowStarts: number[];
  /** Text after the last row, usually a closing rule. */
  tail: string;
  /** Rows and columns can be added and removed only when every row is a plain grid. */
  grid: boolean;
};

type NaturalColumn = { align: 'left' | 'center' | 'right'; padBefore: boolean; padAfter: boolean };

/** Empty intercolumn material suppresses the adjacent `\tabcolsep` on both sides. */
export function latexNaturalColumns(table: LatexTabular): NaturalColumn[] | undefined {
  const columns: NaturalColumn[] = [];
  for (const spec of table.spec.columns) {
    const match = /^(@\{\s*\})?([lcr])(@\{\s*\})?$/.exec(spec.trim());
    if (!match) return;
    const previous = columns.at(-1);
    columns.push({
      align: match[2] === 'c' ? 'center' : match[2] === 'r' ? 'right' : 'left',
      padBefore: !match[1] && (previous?.padAfter ?? true),
      padAfter: !match[3],
    });
  }
  if (columns.length) return columns;
}

export function latexHorizontalRule(source: string) {
  switch (source.trim()) {
    case '\\toprule': return 'top';
    case '\\midrule': return 'middle';
    case '\\bottomrule': return 'bottom';
  }
}

/** Size each natural column to its widest cell plus intercolumn glue. */
export function latexNaturalTableWidths(table: LatexTabular, typography: LatexTypography) {
  const columns = latexNaturalColumns(table);
  const font = typography.romanFont;
  if (!columns || !font) return;
  const widths = columns.map(() => 0);
  for (const row of table.rows) {
    if (row.cells.length === 1 && columns.length > 1 && readLatexMulticolumn(row.cells[0]!.body)?.columns === columns.length)
      continue;
    if (row.cells.length !== columns.length) return;
    for (const [index, cell] of row.cells.entries()) {
      const text = latexTableCellText(cell);
      if (text === undefined) return;
      const words = text.trim().split(/[ \t\r\n]+/).filter(Boolean);
      let width = Math.max(0, words.length - 1) * typography.space;
      for (const word of words) {
        const advance = measureLatexRoman(word, font, typography.text.size);
        if (advance === undefined) return;
        width += advance;
      }
      widths[index] = Math.max(widths[index]!, width);
    }
  }
  return widths.map((width, index) => {
    const { padBefore, padAfter } = columns[index]!;
    return width + (Number(padBefore) + Number(padAfter)) * typography.table.separation;
  });
}

const rule =
  /^(?:\s*(?:\\(?:hline|toprule|midrule|bottomrule)\b|\\(?:cline|cmidrule)\s*(?:\([^)]*\))?\s*(?:\[[^\]]*\])?\s*\{[^}]*\}))+\s*/;

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
    const takesGroup = /[pmbwA-Z@!><]/.test(char);
    let end = index + 1;
    if (takesGroup) {
      while (spec[end] === ' ') end++;
      if (spec[end] === '{') end = groupEnd(spec, end);
      if (char === 'w' && spec[end] === '{') end = groupEnd(spec, end);
      if (end < 0) return;
    }
    const token = spec.slice(index, end);
    if (/^[lcrpmbwA-Z]/.test(token)) {
      columns.push(decoration + token);
      decoration = '';
    } else if (char === '>' || decoration || !columns.length) decoration += token;
    else columns[columns.length - 1] += token;
    index = end;
  }
  if (decoration && columns.length) columns[columns.length - 1] += decoration;
  return columns;
}

/** Split `text` at top-level occurrences of `separator`, outside groups and comments. */
function splitTop(text: string, separator: RegExp) {
  const parts: { text: string; separator: string; start: number }[] = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index < text.length; index++) {
    if (depth === 0) {
      separator.lastIndex = index;
      const match = separator.exec(text);
      if (match) {
        parts.push({ text: text.slice(from, index), separator: match[0], start: from });
        from = index + match[0].length;
        index = from - 1;
        continue;
      }
    }
    const char = text[index];
    if (char === '\\') {
      const end = commandEnd(text, index);
      const command = text.slice(index, end);
      index =
        (command === '\\verb'
          ? verbatimEnd(text, end)
          : command === '\\begin'
            ? (environmentAt(text, index)?.end ?? end)
            : end) - 1;
    } else if (char === '{') depth++;
    else if (char === '}') depth--;
    else if (char === '%') index = lineEnd(text, index);
  }
  parts.push({ text: text.slice(from), separator: '', start: from });
  return parts;
}

const rowEnd = /\\\\\*?(?:\s*\[[^\]]*\])?|\\tabularnewline\b/y;
const cellEnd = /&/y;

function cellOf(text: string): Cell {
  const lead = /^\s*/.exec(text)![0];
  const trail = /\s*$/.exec(text.slice(lead.length))![0];
  return { lead, body: text.slice(lead.length, text.length - trail.length), trail };
}

/** A longtable caption is followed by a row separator but occupies its own layout box. */
function captionRow(source: string) {
  let start = whitespaceEnd(source, 0);
  if (source.startsWith('\\caption', start)) {
    const end = commandEnd(source, start);
    if (source.slice(start, end) !== '\\caption') return false;
    const caption = argumentAt(source, end + Number(source[end] === '*'));
    if (!caption) return false;
    start = whitespaceEnd(source, caption.end);
    if (source.startsWith('\\label', start)) {
      const label = groupAt(source, whitespaceEnd(source, commandEnd(source, start)));
      if (!label) return false;
      start = whitespaceEnd(source, label.end);
    }
    return start === source.length;
  }
  return false;
}

/** Read a table's row source, including the separate roles that continue across pages. */
export function readLatexTabular(source: string): LatexTabular | undefined {
  let environment: ReturnType<typeof environmentAt>;
  let columnSeparation: string | undefined;
  let rowStretch: number | undefined;
  for (const { name, start, end } of latexCommands(source)) {
    if (name === 'setlength') {
      const register = groupAt(source, whitespaceEnd(source, end));
      if (register && source.slice(register.from, register.to).trim() === '\\tabcolsep') {
        const length = groupAt(source, whitespaceEnd(source, register.end));
        if (length) columnSeparation = source.slice(length.from, length.to);
      }
    }
    if (name === 'renewcommand') {
      const register = groupAt(source, whitespaceEnd(source, end));
      if (register && source.slice(register.from, register.to).trim() === '\\arraystretch') {
        const factor = groupAt(source, whitespaceEnd(source, register.end));
        const value = factor && Number(source.slice(factor.from, factor.to).trim());
        if (value && Number.isFinite(value) && value > 0) rowStretch = value;
      }
    }
    if (name !== 'begin') continue;
    const group = groupAt(source, whitespaceEnd(source, end));
    if (!group || !['tabular', 'tabular*', 'tabularx', 'longtable'].includes(source.slice(group.from, group.to)))
      continue;
    environment = environmentAt(source, start);
    break;
  }
  if (!environment) return;
  const continuing = environment.name === 'longtable';
  let open = whitespaceEnd(source, environment.from);
  let tableWidth: string | undefined;
  if (environment.name === 'tabular*' || environment.name === 'tabularx') {
    const width = groupAt(source, open);
    if (!width) return;
    if (environment.name === 'tabularx') tableWidth = source.slice(width.from, width.to);
    open = whitespaceEnd(source, width.end);
  }
  const optional = groupAt(source, open, '[', ']');
  const spec = groupAt(source, whitespaceEnd(source, optional?.end ?? open));
  if (!spec) return;

  const columns = columnsOf(source.slice(spec.from, spec.to));
  const body = source.slice(spec.end, environment.to);
  const rows: Row[] = [];
  const rowStarts: number[] = [];
  const sections: Record<TableSection, TableRows> = {
    firstHead: { rows: [], tail: '', present: false },
    head: { rows: [], tail: '', present: false },
    foot: { rows: [], tail: '', present: false },
    lastFoot: { rows: [], tail: '', present: false },
    body: { rows: [], tail: '', present: false },
  };
  let tail = '';
  const groups = continuing ? splitTop(body, sectionEnds) : [{ text: body, separator: '', start: 0 }];
  for (const group of groups) {
    const section = sectionOf.get(group.separator) ?? 'body';
    sections[section].present = true;
    const pieces = splitTop(group.text, rowEnd);
    for (const piece of pieces) {
      const rules = rule.exec(piece.text)?.[0] ?? /^\s*/.exec(piece.text)![0];
      const rest = piece.text.slice(rules.length);
      if (piece === pieces.at(-1) && !rest.trim()) {
        sections[section].tail = piece.text;
        if (section === 'body') tail = piece.text;
        break;
      }
      if (continuing && captionRow(rest)) continue;
      sections[section].rows.push(rows.length);
      rowStarts.push(spec.end + group.start + piece.start);
      rows.push({
        rules,
        cells: splitTop(rest, cellEnd).map((cell) => cellOf(cell.text)),
        end: piece.separator,
      });
    }
  }
  // A tabular outside a float has no caption slot. A center wrapper is still editable.
  const caption = /^\s*\\begin\s*\{table\*?\}/.test(source);
  const width = columns?.length;
  const grid =
    !continuing &&
    !!width &&
    rows.every(
      (row) =>
        row.cells.length === width &&
        !row.cells.some((cell) => /\\multi(?:column|row)\b/.test(cell.body)),
    );
  return {
    start: spec.end,
    end: environment.to,
    spec: {
      start: spec.from, end: spec.to, columns: columns ?? [],
      ...(tableWidth !== undefined && { width: tableWidth }),
      ...(columnSeparation !== undefined && { columnSeparation }),
      ...(rowStretch !== undefined && { rowStretch }),
    },
    rows,
    layout: continuing ? { kind: 'continuing', sections } : { kind: 'fixed', caption },
    rowStarts,
    tail,
    grid,
  };
}

/** Recognize blocks that can be represented by the table without losing its siblings. */
export function readLatexTableBlock(source: string) {
  const start = whitespaceEnd(source, 0);
  const outer = environmentAt(source, start);
  if (!outer || source.slice(outer.end).trim()) return;
  switch (outer.name) {
    case 'tabular':
    case 'tabular*':
    case 'tabularx':
    case 'longtable':
    case 'table':
    case 'table*':
      return readLatexTabular(source);
    case 'center': {
      const inner = environmentAt(source, whitespaceEnd(source, outer.from));
      if (inner && ['tabular', 'tabular*', 'tabularx'].includes(inner.name) &&
          !source.slice(inner.end, outer.to).trim()) return readLatexTabular(source);
    }
  }
}

/** Read an ordinary multicolumn cell for the table layout, keeping its source intact. */
export function readLatexMulticolumn(source: string) {
  const span = readLatexCellSpan(source);
  if (span?.kind !== 'column') return;
  return { columns: span.count, align: /[lcr]/.exec(span.spec)?.[0], text: latexFieldText(span.text) ?? span.text };
}

/** Text shown in a cell, or undefined when its TeX has to be edited as TeX. */
export const latexTableCellText = (cell: Cell) =>
  latexFieldText(readLatexCellSpan(cell.body)?.text ?? cell.body);

const rowSource = (row: Row) =>
  row.rules + row.cells.map((cell) => cell.lead + cell.body + cell.trail).join('&') + row.end;

/** Write a changed table back, leaving the source outside the tabular as it was. */
export function writeLatexTabular(source: string, table: LatexTabular) {
  if (table.layout.kind === 'continuing') return source;
  const body = table.rows.map(rowSource).join('') + table.tail;
  const withBody = splice(source, table.start, table.end, body);
  return splice(withBody, table.spec.start, table.spec.end, table.spec.columns.join(''));
}

/** Set one cell from text, or from TeX when `tex`. */
export function setLatexTableCell(source: string, row: number, column: number, value: string, tex: boolean) {
  const table = readLatexTabular(source);
  const cell = table?.rows[row]?.cells[column];
  if (!table || !cell) return source;
  const text = tex ? value : latexFieldSource(value);
  const span = readLatexCellSpan(cell.body);
  const body = span ? splice(cell.body, span.from, span.to, text) : text;
  if (table.layout.kind === 'continuing') {
    const entry = table.rows[row]!;
    const preceding = entry.cells.slice(0, column).reduce(
      (length, previous) => length + previous.lead.length + previous.body.length + previous.trail.length + 1,
      0,
    );
    const start = table.rowStarts[row]! + entry.rules.length + preceding + cell.lead.length;
    return splice(source, start, start + cell.body.length, body);
  }
  // A blank cell gets the usual ` & ` spacing; a written one keeps its own.
  if (!cell.body.trim()) {
    if (!column) table.rows[row]!.rules = table.rows[row]!.rules.replace(/(\n)[ \t]+$/, '$1');
    cell.lead = column ? ' ' : '';
    cell.trail = ' ';
  }
  cell.body = body;
  return splice(source, table.start, table.end, table.rows.map(rowSource).join('') + table.tail);
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
  const inserted = blankRow(table.spec.columns.length, end.startsWith(' ') ? end : ' ' + end);
  const following = table.rows[at];
  // Keep the opening rule above the grid and the header rule above the first body row.
  if (following && (at === 0 || (at === 1 && after)) && following.rules.trim()) {
    [inserted.rules, following.rules] = [following.rules, inserted.rules];
  }
  table.rows.splice(at, 0, inserted);
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
