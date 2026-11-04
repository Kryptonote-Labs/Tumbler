import { expect, test } from 'bun:test';
import { layoutWordDocument } from '../src/index.ts';
import { paginationDocument, paginationMeasurer, paragraph, section } from './pagination-fixture.ts';

test('viewport reflow wraps text in one column without changing the document section', () => {
  const document = paginationDocument(paragraph('A launch plan with enough words to wrap across several readable mobile lines.'), section('<w:cols w:num="2"/>', 12000).replace('w:w="2400"', 'w:w="12240"'));
  const original = document.finalSection;
  const print = layoutWordDocument(document, paginationMeasurer);
  const mobile = layoutWordDocument(document, paginationMeasurer, { reflowWidth: 150 });
  expect(mobile.pages[0]!.width).toBe(150);
  expect(mobile.pages[0]!.columns).toHaveLength(1);
  expect(mobile.pages[0]!.columns[0]!.lines[0]!.fragments[0]!.format.fontSizePoints).toBe(print.pages[0]!.columns[0]!.lines[0]!.fragments[0]!.format.fontSizePoints);
  expect(mobile.pages.flatMap(page => page.columns.flatMap(column => column.lines)).length).toBeGreaterThan(print.pages.flatMap(page => page.columns.flatMap(column => column.lines)).length);
  expect(document.finalSection).toBe(original);
  expect(layoutWordDocument(document, paginationMeasurer).pages[0]!.section).toBe(original);
});
