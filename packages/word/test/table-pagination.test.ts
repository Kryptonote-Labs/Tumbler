import { expect, test } from 'bun:test';
import { layoutWordDocument, openWordArtifact, type WordLayout, type WordLayoutTable, type WordLayoutLine } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const measure = { measure: (text: string) => ({ width: text.length * 5, ascent: 8, descent: 2 }) };
const section = '<w:sectPr><w:pgSz w:w="4400" w:h="2400"/><w:pgMar w:top="200" w:bottom="200" w:left="200" w:right="200"/></w:sectPr>';
const paragraph = (text: string, line = 200) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${line}" w:lineRule="exact"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const lines = (prefix: string, count: number, line = 200) => Array.from({ length: count }, (_, i) => paragraph(`${prefix}${i}`, line)).join('');
const cell = (body: string, properties = '') => `<w:tc><w:tcPr>${properties}</w:tcPr>${body}</w:tc>`;
const row = (body: string, properties = '') => `<w:tr><w:trPr>${properties}</w:trPr>${body}</w:tr>`;
const table = (rows: string, columns = 1) => `<w:tbl><w:tblPr><w:tblCellMar><w:top w:type="dxa" w:w="0"/><w:bottom w:type="dxa" w:w="0"/><w:left w:type="dxa" w:w="0"/><w:right w:type="dxa" w:w="0"/></w:tblCellMar></w:tblPr><w:tblGrid>${'<w:gridCol w:w="1800"/>'.repeat(columns)}</w:tblGrid>${rows}</w:tbl>`;
function layout(body: string) {
  const artifact = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${namespace}"><w:body>${body}${section}</w:body></w:document>` }));
  return layoutWordDocument(artifact.document, measure);
}
function tableLines(table: WordLayoutTable): WordLayoutLine[] {
  return table.cells.flatMap(cell => [...cell.lines, ...cell.tables.flatMap(tableLines)]);
}
function allLines(layout: WordLayout): WordLayoutLine[] {
  return layout.pages.flatMap(page => page.columns.flatMap(column => [...column.lines, ...column.tables.flatMap(tableLines)].sort((a, b) => a.y - b.y)));
}
function texts(layout: WordLayout) {
  return allLines(layout).map(line => line.fragments.map(fragment => fragment.text).join('')).filter(Boolean);
}
function withinPages(layout: WordLayout) {
  for (const page of layout.pages) for (const column of page.columns) {
    for (const table of column.tables) {
      expect(table.y).toBeGreaterThanOrEqual(column.y - 1e-6);
      expect(table.y + table.height).toBeLessThanOrEqual(column.y + column.height + 1e-6);
      for (const line of tableLines(table)) {
        expect(line.y).toBeGreaterThanOrEqual(column.y - 1e-6);
        expect(line.y + line.height).toBeLessThanOrEqual(column.y + column.height + 1e-6);
      }
    }
  }
}

test('an empty paragraph spilling onto a new page does not strand a tall row on the following page', () => {
  const result = layout(lines('Before', 10) + paragraph('') + table(row(cell(lines('Cell', 25)))) + paragraph('After'));
  expect(result.pages).toHaveLength(4);
  expect(result.pages[1]!.columns[0]!.tables[0]?.cells[0]?.lines[0]?.fragments[0]?.text).toBe('Cell0');
  expect(texts(result)).toEqual([
    ...Array.from({ length: 10 }, (_, i) => `Before${i}`),
    ...Array.from({ length: 25 }, (_, i) => `Cell${i}`), 'After',
  ]);
  withinPages(result);
});

test('each cell breaks at its own line boundaries without losing or duplicating source ranges', () => {
  const result = layout(paragraph('Before', 360) + table(row(cell(lines('Left', 23, 220)) + cell(lines('Right', 18, 280)), ''), 2));
  expect(result.pages.length).toBeGreaterThan(2);
  for (const [prefix, count] of [['Left', 23], ['Right', 18]] as const) {
    expect(texts(result).filter(text => text.startsWith(prefix))).toEqual(Array.from({ length: count }, (_, i) => `${prefix}${i}`));
  }
  const ids = allLines(result).map(line => `${line.paragraphElementId}:${line.startOffset}:${line.endOffset}`);
  expect(new Set(ids).size).toBe(ids.length);
  withinPages(result);
});

test('wrapped paragraphs continue with contiguous offsets and unchanged text', () => {
  const text = 'one two three four five six seven eight nine ten '.repeat(15).trimEnd();
  const result = layout(table(row(cell(paragraph(text)))));
  const rendered = allLines(result);
  expect(result.pages.length).toBeGreaterThan(1);
  expect(rendered[0]!.startOffset).toBe(0);
  expect(rendered.at(-1)!.endOffset).toBe(text.length);
  for (const [index, line] of rendered.entries()) {
    if (index) expect(line.startOffset).toBe(rendered[index - 1]!.endOffset);
    expect(line.fragments.map(fragment => fragment.text).join('')).toBe(text.slice(line.startOffset, line.endOffset).trimEnd());
  }
  withinPages(result);
});

test('cantSplit moves a fitting row intact but lets an oversized row continue after starting a fresh page', () => {
  for (const count of [6, 25]) {
    const result = layout(lines('Before', 5) + table(row(cell(lines('Cell', count)), '<w:cantSplit/>')));
    expect(result.pages[0]!.columns[0]!.tables).toHaveLength(0);
    expect(result.pages[1]!.columns[0]!.tables[0]!.y).toBe(10);
    expect(texts(result).filter(text => text.startsWith('Cell'))).toHaveLength(count);
    withinPages(result);
  }
});

test('repeated headers accompany row continuations without duplicating body text', () => {
  const result = layout(table(row(cell(paragraph('Header')), '<w:tblHeader/>') + row(cell(lines('Body', 24)))));
  expect(result.pages).toHaveLength(3);
  for (const page of result.pages) expect(page.columns[0]!.tables[0]!.cells[0]!.lines[0]!.fragments[0]!.text).toBe('Header');
  expect(texts(result).filter(text => text.startsWith('Body'))).toEqual(Array.from({ length: 24 }, (_, i) => `Body${i}`));
  withinPages(result);
});

test('vertical merges retain all cell content across page fragments', () => {
  const result = layout(table(
    row(cell(lines('Merged', 25), '<w:vMerge w:val="restart"/>') + cell(lines('Top', 5))) +
    row(cell(paragraph(''), '<w:vMerge/>') + cell(lines('Bottom', 16))), 2));
  for (const [prefix, count] of [['Merged', 25], ['Top', 5], ['Bottom', 16]] as const) {
    expect(texts(result).filter(text => text.startsWith(prefix))).toEqual(Array.from({ length: count }, (_, i) => `${prefix}${i}`));
  }
  const merged = result.pages.flatMap(page => page.columns[0]!.tables.flatMap(table => table.cells.filter(cell => cell.column === 0)));
  expect(new Set(merged.map(cell => cell.cellElementId)).size).toBe(1);
  expect(merged.every(cell => cell.continuationElementIds.length === 1)).toBe(true);
  withinPages(result);
});

test('nested tables and surrounding paragraphs continue in their source order', () => {
  const result = layout(table(row(cell(paragraph('Before nested') + table(row(cell(lines('Nested', 24)))) + paragraph('After nested')))));
  // Geometric order is the reading order inside a cell, including nested tables.
  const ordered = result.pages.flatMap(page => page.columns.flatMap(column => column.tables.flatMap(tableLines).sort((a, b) => a.y - b.y)))
    .map(line => line.fragments.map(fragment => fragment.text).join(''));
  expect(ordered).toEqual(['Before nested', ...Array.from({ length: 24 }, (_, i) => `Nested${i}`), 'After nested']);
  withinPages(result);
});


test.each(['0', 'false', 'off'])('cantSplit=%s permits a row to use the remaining page', value => {
  const result = layout(lines('Before', 5) + table(row(cell(lines('Cell', 6)), `<w:cantSplit w:val="${value}"/>`)));
  expect(result.pages[0]!.columns[0]!.tables).toHaveLength(1);
  expect(texts(result).filter(text => text.startsWith('Cell'))).toHaveLength(6);
  withinPages(result);
});

test('cell padding stays with content on the final continuation page', () => {
  const result = layout(table(row(cell(lines('Cell', 10), '<w:tcMar><w:top w:type="dxa" w:w="100"/><w:bottom w:type="dxa" w:w="200"/></w:tcMar>'))));
  expect(result.pages).toHaveLength(2);
  expect(result.pages.every(page => page.columns[0]!.tables.some(table => tableLines(table).some(line => line.fragments.length)))).toBe(true);
  expect(texts(result)).toEqual(Array.from({ length: 10 }, (_, i) => `Cell${i}`));
  withinPages(result);
});

const padding = '<w:tcMar><w:top w:type="dxa" w:w="100"/><w:bottom w:type="dxa" w:w="100"/></w:tcMar>';
function borderedTable(rows: string, columns = 1) {
  const borders = ['top', 'bottom', 'left', 'right', 'insideH', 'insideV']
    .map(side => `<w:${side} w:val="single" w:sz="8"/>`).join('');
  return table(rows, columns).replace('<w:tblPr>', `<w:tblPr><w:tblBorders>${borders}</w:tblBorders>`);
}

test('border thickness contributes to row height and pagination', () => {
  const result = layout(borderedTable(Array.from({ length: 5 }, (_, i) => row(cell(paragraph(`Row${i}`), padding))).join('')));
  expect(result.pages).toHaveLength(2);
  const first = result.pages[0]!.columns[0]!.tables[0]!;
  expect(first.cells).toHaveLength(4);
  for (const cell of first.cells) {
    expect(cell.height).toBe(21); // 10pt line + 10pt padding + two half-point strokes.
    expect(cell.lines[0]!.y - cell.y).toBe(5.5);
  }
  expect(texts(result)).toEqual(['Row0', 'Row1', 'Row2', 'Row3', 'Row4']);
  withinPages(result);
});

test('a shared cell border reserves the winning stroke on both adjacent rows', () => {
  const override = '<w:tcBorders><w:bottom w:val="single" w:sz="32"/></w:tcBorders>';
  const result = layout(borderedTable(row(cell(paragraph('A'), padding + override)) + row(cell(paragraph('B'), padding))));
  const cells = result.pages[0]!.columns[0]!.tables[0]!.cells;
  expect(cells.map(cell => cell.height)).toEqual([22.5, 22.5]);
  expect(cells.map(cell => cell.lines[0]!.y - cell.y)).toEqual([5.5, 7]);
});

test('merged cells use their perimeter rather than interior row borders', () => {
  const result = layout(borderedTable(
    row(cell(paragraph('Merged'), padding + '<w:vMerge w:val="restart"/>') + cell(paragraph('A'), padding)) +
    row(cell(paragraph(''), '<w:vMerge/>') + cell(paragraph('B'), padding)), 2));
  const table = result.pages[0]!.columns[0]!.tables[0]!;
  expect(table.height).toBe(42);
  expect(table.cells.find(cell => cell.column === 0)!.height).toBe(42);
  expect(table.cells.filter(cell => cell.column === 1).map(cell => cell.height)).toEqual([21, 21]);
});

test('continued rows retain top and bottom padding and border space on every page', () => {
  const result = layout(borderedTable(row(cell(lines('Cell', 24), padding))));
  expect(result.pages).toHaveLength(3);
  for (const page of result.pages) {
    const cell = page.columns[0]!.tables[0]!.cells[0]!;
    expect(cell.lines).toHaveLength(8);
    expect(cell.lines[0]!.y - cell.y).toBe(5.5);
    const last = cell.lines.at(-1)!;
    expect(cell.y + cell.height - last.y - last.height).toBeGreaterThanOrEqual(5.5);
  }
  expect(texts(result)).toEqual(Array.from({ length: 24 }, (_, i) => `Cell${i}`));
  withinPages(result);
});

test('tables without borders do not acquire stroke spacing', () => {
  const result = layout(table(row(cell(paragraph('A'), padding)) + row(cell(paragraph('B'), padding))));
  const cells = result.pages[0]!.columns[0]!.tables[0]!.cells;
  expect(cells.map(cell => cell.height)).toEqual([20, 20]);
  expect(cells.map(cell => cell.lines[0]!.y - cell.y)).toEqual([5, 5]);
});


test.each([
  ['false', false], ['0', false], ['off', false],
  ['true', true], ['1', true], ['on', true], [undefined, true],
] as const)('repeats header rows only when tblHeader %s enables them', (value, enabled) => {
  const flag = value === undefined ? '<w:tblHeader/>' : `<w:tblHeader w:val="${value}"/>`;
  const result = layout(table(row(cell(paragraph('Header')), flag) + Array.from({ length: 25 }, (_, i) => row(cell(paragraph(`Body${i}`)))).join('')));
  expect(result.pages.length).toBeGreaterThan(1);
  const headers = texts(result).filter(text => text === 'Header');
  expect(headers).toHaveLength(enabled ? result.pages.length : 1);
  expect(texts(result).filter(text => text.startsWith('Body'))).toHaveLength(25);
});

test('balancing keeps a row intact when it fits the natural column height', () => {
  const sect = '<w:sectPr><w:pgSz w:w="8000" w:h="4000"/><w:pgMar w:top="400" w:bottom="400" w:left="400" w:right="400"/><w:cols w:num="2" w:space="400"/></w:sectPr>';
  const artifact = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${namespace}"><w:body>${table(row(cell(lines('Row', 6)), '<w:cantSplit/>'))}${sect}</w:body></w:document>` }));
  const result = layoutWordDocument(artifact.document, measure);
  const tables = result.pages.flatMap(page => page.columns.flatMap(column => column.tables));
  expect(tables).toHaveLength(1);
  expect(tables[0]!.height).toBe(60);
});

test('percentage table continuations rewrap at each unequal column width', () => {
  const sect = '<w:sectPr><w:pgSz w:w="8000" w:h="3000"/><w:pgMar w:top="400" w:bottom="400" w:left="400" w:right="400"/><w:cols w:equalWidth="0"><w:col w:w="4000" w:space="400"/><w:col w:w="1600"/></w:cols></w:sectPr>';
  const text = 'abcdef '.repeat(160);
  const content = table(row(cell(paragraph(text)))).replace('<w:tblPr>', '<w:tblPr><w:tblW w:type="pct" w:w="5000"/>');
  const artifact = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${namespace}"><w:body>${content}${sect}</w:body></w:document>` }));
  const result = layoutWordDocument(artifact.document, measure);
  for (const page of result.pages) for (const column of page.columns) for (const table of column.tables) {
    expect(table.width).toBe(column.width);
    expect(tableLines(table).every(line => line.width <= column.width)).toBe(true);
  }
  const rendered = allLines(result);
  expect(rendered[0]!.startOffset).toBe(0);
  expect(rendered.at(-1)!.endOffset).toBe(text.length);
  for (let index = 1; index < rendered.length; index++) expect(rendered[index]!.startOffset).toBe(rendered[index - 1]!.endOffset);
});

test('protected rows larger than the footer-adjusted body make progress across pages', () => {
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const sect = '<w:sectPr><w:footerReference w:type="default" r:id="footer"/><w:pgSz w:w="4400" w:h="2400"/><w:pgMar w:top="200" w:bottom="200" w:left="200" w:right="200" w:footer="200"/></w:sectPr>';
  const artifact = openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${namespace}" xmlns:r="${rel}"><w:body>${table(row(cell(lines('Row', 6)), '<w:cantSplit/>'))}${sect}</w:body></w:document>`,
    relationships: [{ id: 'footer', type: `${rel}/footer`, target: 'footer.xml' }],
    parts: [{ itemName: 'word/footer.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml', xml: `<w:ftr xmlns:w="${namespace}">${paragraph('Footer', 1000)}</w:ftr>` }],
  }));
  const result = layoutWordDocument(artifact.document, measure, { maxPages: 5 });
  expect(result.pages).toHaveLength(2);
  expect(texts(result)).toEqual(Array.from({ length: 6 }, (_, index) => `Row${index}`));
});
