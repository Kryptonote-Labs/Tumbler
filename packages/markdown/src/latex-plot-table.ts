type TableSource = { file: string } | { inline: string };

export type LatexPlotTable = {
  source: TableSource;
  separator: 'comma' | 'tab' | 'space';
  rowSeparator: 'line' | 'tex';
  x?: string;
  y?: string;
  xIndex?: number;
  yIndex?: number;
};

export function latexPlotTable(source: string, options: ReadonlyMap<string, string>): LatexPlotTable {
  const separator = options.get('col sep');
  const x = options.get('x');
  const y = options.get('y');
  const xIndex = options.get('x index');
  const yIndex = options.get('y index');
  return {
    source: /\r|\n|\\\\/.test(source) ? { inline: source } : { file: source.trim() },
    separator: separator === 'comma' || separator === 'tab' ? separator : 'space',
    rowSeparator: options.get('row sep') === '\\\\' ? 'tex' : 'line',
    ...(x !== undefined && { x }),
    ...(y !== undefined && { y }),
    ...(xIndex !== undefined && { xIndex: Number(xIndex) }),
    ...(yIndex !== undefined && { yIndex: Number(yIndex) }),
  };
}

function csvFields(line: string) {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i]!;
    if (character === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      fields.push(field.trim());
      field = '';
    } else field += character;
  }
  fields.push(field.trim());
  return fields;
}

/** Select two numeric columns from a PGFPlots table in authored row order. */
export function latexPlotPoints(table: LatexPlotTable, resolve?: (path: string) => string | undefined) {
  const content = 'file' in table.source ? resolve?.(table.source.file) : table.source.inline;
  if (!content) return;
  const rows = content.split(table.rowSeparator === 'tex' ? /\\\\/ : /\r\n?|\n/)
    .map(row => row.trim())
    .filter(row => row && !row.startsWith('%'))
    .map(row => table.separator === 'comma' ? csvFields(row) : row.split(table.separator === 'tab' ? /\t/ : /\s+/));
  const header = rows[0];
  if (!header) return;
  const number = (value: string | undefined) => value?.trim() ? Number(value) : NaN;
  const hasHeader = header.some(value => !Number.isFinite(number(value)));
  const x = table.x === undefined ? table.xIndex ?? 0 : header.indexOf(table.x);
  const y = table.y === undefined ? table.yIndex ?? 1 : header.indexOf(table.y);
  if (x < 0 || y < 0) return;
  const points = rows.slice(Number(hasHeader)).map(row => ({ x: number(row[x]), y: number(row[y]) }));
  if (points.length && points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return points;
}
