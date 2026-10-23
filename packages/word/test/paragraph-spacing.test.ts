import { expect, test } from 'bun:test';
import { layoutWordDocument } from '../src/index.ts';
import { layoutWordStory } from '../src/layout.ts';
import { paginationDocument, paginationMeasurer, paragraph, section } from './pagination-fixture.ts';

const spacing = (before: number, after: number, contextual = false, style = 'Normal') =>
  `<w:pStyle w:val="${style}"/><w:spacing w:before="${before * 20}" w:after="${after * 20}" w:line="200" w:lineRule="exact"/>${contextual ? '<w:contextualSpacing/>' : ''}`;
for (const [name, first, second, gap] of [
  ['maximum', spacing(12, 12), spacing(12, 12), 12],
  ['contextual both', spacing(12, 12, true), spacing(12, 12, true), 0],
  ['contextual first only', spacing(0, 10, true), spacing(12, 0), 2],
  ['contextual second only', spacing(0, 12), spacing(10, 0, true), 2],
  ['different styles', spacing(0, 10, true, 'A'), spacing(12, 0, true, 'B'), 12],
] as const) {
  test(`${name} resolves spacing in body, table, and story`, () => {
    const body = paragraph('first', first) + paragraph('second', second);
    const document = paginationDocument(body, section('', 6000));
    const lines = layoutWordDocument(document, paginationMeasurer).pages[0]!.columns[0]!.lines;
    expect(lines[1]!.y - lines[0]!.y - 10).toBe(gap);
    const table = paginationDocument(`<w:tbl><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc>${body}</w:tc></w:tr></w:tbl>`, section('', 6000));
    const cell = layoutWordDocument(table, paginationMeasurer).pages[0]!.columns[0]!.tables[0]!.cells[0]!;
    expect(cell.lines[1]!.y - cell.lines[0]!.y - 10).toBe(gap);
    const story = layoutWordStory({ blocks: document.blocks, drawings: document.drawings, listMarkers: new Map(), paragraphFormat: p => document.styles.paragraphFormat(document, p), runFormat: (p, r) => document.styles.runFormat(document, p, r) }, 100, paginationMeasurer);
    expect(story.lines[1]!.y - story.lines[0]!.y - 10).toBe(gap);
  });
}
test('resolved gaps determine body page count and table row height', () => {
  const body = paragraph('a', spacing(0, 12)) + paragraph('b', spacing(12, 0));
  const layout = layoutWordDocument(paginationDocument(body, section('', 1040)), paginationMeasurer);
  expect(layout.pages).toHaveLength(1);
  const table = layoutWordDocument(paginationDocument(`<w:tbl><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc>${body}</w:tc></w:tr></w:tbl>`, section('', 1040)), paginationMeasurer);
  expect(table.pages).toHaveLength(1);
  expect(table.pages[0]!.columns[0]!.tables[0]!.height).toBe(32);
});
test('continuous sections retain body paragraph adjacency', () => {
  for (const contextual of [false, true]) {
    const body = paragraph('first', spacing(0, 12, contextual) + section('', 6000)) + paragraph('second', spacing(12, 0, contextual));
    const document = paginationDocument(body, section('<w:type w:val="continuous"/>', 6000));
    const lines = layoutWordDocument(document, paginationMeasurer).pages[0]!.columns[0]!.lines;
    expect(lines[1]!.y - lines[0]!.y - 10).toBe(contextual ? 0 : 12);
  }
});
test('table continuations discard predecessor spacing at the split', () => {
  const body = paragraph('first', spacing(0, 24)) + paragraph('second', spacing(0, 0));
  const document = paginationDocument(`<w:tbl><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc>${body}</w:tc></w:tr></w:tbl>`);
  const layout = layoutWordDocument(document, paginationMeasurer);
  const column = layout.pages[1]!.columns[0]!;
  const lines = column.tables[0]!.cells[0]!.lines;
  expect(lines[0]!.y).toBe(10);
  expect(lines.every(line => line.y + line.height <= column.y + column.height)).toBe(true);
});
