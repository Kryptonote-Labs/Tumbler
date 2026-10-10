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
