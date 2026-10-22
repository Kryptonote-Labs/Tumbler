import { expect, test } from 'bun:test';
import { layoutWordDocument } from '../src/index.ts';
import { paginationDocument, paginationMeasurer, paragraph, section } from './pagination-fixture.ts';

const columns = '<w:cols w:num="2" w:space="200"/>';
function transition(extra = columns, height = 1000) {
  return paginationDocument(paragraph('first', section(columns)) + paragraph('second'), section(`<w:type w:val="nextColumn"/>${extra}`, height));
}
test('nextColumn section uses the remaining compatible column', () => {
  const layout = layoutWordDocument(transition(), paginationMeasurer);
  expect(layout.pages).toHaveLength(1);
  expect(layout.pages[0]!.columns.map(column => column.lines.map(line => line.fragments.map(fragment => fragment.text).join('')))).toEqual([['first'], ['second']]);
});
test('nextColumn with changed geometry starts a page using the new section', () => {
  for (const document of [transition('', 1000), transition(columns, 1200)]) {
    const layout = layoutWordDocument(document, paginationMeasurer);
    expect(layout.pages).toHaveLength(2);
    expect(layout.pages[1]!.section).toBe(document.finalSection);
  }
});
test('overflow after a shared nextColumn section uses its active section', () => {
  const document = paginationDocument(paragraph('first', section(columns)) + Array.from({ length: 4 }, () => paragraph('next')).join(''), section(`<w:type w:val="nextColumn"/>${columns}`));
  const layout = layoutWordDocument(document, paginationMeasurer);
  expect(layout.pages).toHaveLength(2);
  expect(layout.pages[0]!.columns[1]!.lines).toHaveLength(3);
  expect(layout.pages[1]!.section).toBe(document.finalSection);
});
