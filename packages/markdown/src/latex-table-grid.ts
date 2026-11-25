import type { LatexTabular } from './latex-tables';
import { latexLength } from './latex-lengths';
import { commandEnd, groupAt, whitespaceEnd } from './latex-syntax';

export function readLatexCellSpan(source: string) {
  const start = whitespaceEnd(source, 0);
  const end = commandEnd(source, start);
  const command = source.slice(start, end);
  if (command !== '\\multirow' && command !== '\\multicolumn') return;
  const at = whitespaceEnd(source, end);
  const position = command === '\\multirow' ? groupAt(source, at, '[', ']') : undefined;
  const count = groupAt(source, whitespaceEnd(source, position?.end ?? at));
  const spec = count && groupAt(source, whitespaceEnd(source, count.end));
  const shift = spec && command === '\\multirow' ? groupAt(source, whitespaceEnd(source, spec.end), '[', ']') : undefined;
  const value = spec && groupAt(source, whitespaceEnd(source, shift?.end ?? spec.end));
  if (!count || !spec || !value || source.slice(value.end).trim()) return;
  const size = Number(source.slice(count.from, count.to));
  if (!Number.isSafeInteger(size) || size < 1) return;
  return {
    kind: command === '\\multirow' ? 'row' as const : 'column' as const,
    count: size,
    spec: source.slice(spec.from, spec.to),
    from: value.from,
    to: value.to,
    text: source.slice(value.from, value.to),
  };
}

type CellPlacement = {
  column: number;
  columns: number;
  rows: number;
  left: boolean;
  right: boolean;
  align: 'left' | 'center' | 'right' | 'justify';
  width?: number;
  ragged?: boolean;
  ruleBefore: boolean;
};

type TextWidths = { line: number; text: number };
export function latexColumnLength(value: string | undefined, quad: number, available?: TextWidths) {
  const relative = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)?)\s*\\(line|column|text)width\s*$/.exec(value ?? '');
  if (relative && available) {
    const factor = relative[1] ? Number(relative[1]) : 1;
    return factor * (relative[2] === 'text' ? available.text : available.line);
  }
  return latexLength(value, quad);
}

/** One placement per authored cell. A null cell is an empty slot covered by a row span. */
export function latexTableGrid(table: LatexTabular, quad: number, available?: TextWidths) {
  const setup = table.spec.columns;
  if (!setup.length || table.layout.kind !== 'fixed') return;
  const occupied = setup.map(() => 0);
  const rows: (CellPlacement | null)[][] = [];
  for (const [index, row] of table.rows.entries()) {
    const placements: (CellPlacement | null)[] = [];
    const rules: [number, number][] = [...row.rules.matchAll(/\\(?:cline|cmidrule)\s*\{(\d+)\s*-\s*(\d+)\}/g)]
      .map(([, from, to]) => [Number(from) - 1, Number(to)]);
    let column = 0;
    for (const cell of row.cells) {
      if (column >= setup.length) return;
      if (occupied[column]! > index) {
        if (cell.body) return;
        placements.push(null);
        column++;
        continue;
      }
      const span = readLatexCellSpan(cell.body);
      const columns = span?.kind === 'column' ? span.count : 1;
      const spansRows = span?.kind === 'row' ? span.count : 1;
      if (column + columns > setup.length || index + spansRows > table.rows.length ||
          occupied.slice(column, column + columns).some(until => until > index)) return;
      for (let next = column; next < column + columns; next++) occupied[next] = index + spansRows;
      const authored = span?.kind === 'column' ? span.spec : setup[column]!;
      const declaration = /^\s*>\s*\{\s*\\(raggedright|raggedleft|centering)\s*(?:\\arraybackslash\s*)?\}/.exec(authored);
      const spec = declaration ? authored.slice(declaration[0].length) : authored;
      const format = /^\s*(\|*)\s*([lcrpmb])(?:\s*\{([^{}]*)\})?\s*(\|*)\s*$/.exec(spec);
      const width = latexColumnLength(format?.[3], quad, available);
      const alignment = format?.[2];
      const align = declaration
        ? declaration[1] === 'raggedright' ? 'left' : declaration[1] === 'raggedleft' ? 'right' : 'center'
        : alignment === 'r' ? 'right' : alignment === 'c' ? 'center' : alignment === 'p' && width !== undefined ? 'justify' : 'left';
      placements.push({
        column, columns, rows: spansRows,
        left: !!format?.[1],
        right: !!format?.[4],
        align,
        ...(declaration && { ragged: true }),
        ...(width !== undefined && width >= 0 ? { width } : {}),
        ruleBefore: rules.some(([from, to]) => from <= column && column + columns <= to),
      });
      column += columns;
    }
    rows.push(placements);
  }
  return rows;
}
