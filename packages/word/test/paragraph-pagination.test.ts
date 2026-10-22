import { expect, test } from 'bun:test';
import { layoutWordDocument } from '../src/index.ts';
import { paginationDocument, paginationMeasurer, paragraph, section } from './pagination-fixture.ts';

const textPages = (body: string, height = 1000) => layoutWordDocument(paginationDocument(body, section('', height)), paginationMeasurer).pages.map(page => page.columns.flatMap(column => column.lines.map(line => line.fragments.map(fragment => fragment.text).join(''))));
test('keepNext moves a heading without keepLines', () => {
  expect(textPages(paragraph('filler1') + paragraph('filler2') + paragraph('heading', '<w:keepNext/>') + paragraph('following'))).toEqual([['filler1', 'filler2'], ['heading', 'following']]);
});
test('keep chains move together including the final paragraph', () => {
  expect(textPages(paragraph('filler') + paragraph('h1', '<w:keepNext/>') + paragraph('h2', '<w:keepNext/>') + paragraph('end'))).toEqual([['filler'], ['h1', 'h2', 'end']]);
});
test('oversized keep chains start fresh once and then make progress', () => {
  const chain = Array.from({ length: 8 }, (_, i) => paragraph(String(i), '<w:keepNext/>')).join('') + paragraph('end');
  expect(textPages(paragraph('filler') + chain)).toEqual([['filler'], ['0', '1', '2'], ['3', '4', '5'], ['6', '7', 'end']]);
});
test('widow control defaults on, can be disabled, and protects both ends', () => {
  for (const property of ['', '<w:widowControl/>']) {
    expect(textPages(paragraph('a'.repeat(61), property)).map(page => page.length)).toEqual([2, 2]);
    expect(textPages(paragraph('filler1') + paragraph('filler2') + paragraph('a'.repeat(41), property)).map(page => page.length)).toEqual([2, 3]);
  }
  expect(textPages(paragraph('a'.repeat(61), '<w:widowControl w:val="0"/>')).map(page => page.length)).toEqual([3, 1]);
});
test('oversized paragraphs and one-line pages terminate without overflow pairs', () => {
  for (const properties of ['', '<w:keepLines/>', '<w:keepNext/>']) {
    expect(textPages(paragraph('a'.repeat(61), properties), 600).map(page => page.length)).toEqual([1, 1, 1, 1]);
  }
});
test('explicit breaks win over keep and widow policies', () => {
  expect(textPages(paragraph('first', '<w:keepNext/>') + paragraph('second', '<w:pageBreakBefore/>'))).toEqual([['first'], ['second']]);
  const body = '<w:p><w:pPr><w:spacing w:line="200" w:lineRule="exact"/></w:pPr><w:r><w:t>first</w:t><w:br w:type="page"/><w:t>second</w:t></w:r></w:p>';
  expect(textPages(body)).toEqual([['first'], ['second']]);
});
test('pageLimit retains the exact completed-page prefix for keeps and widows', () => {
  const body = paragraph('filler') + paragraph('heading', '<w:keepNext/>') + paragraph('a'.repeat(121)) + Array.from({ length: 20 }, () => paragraph('next', '<w:keepNext/>')).join('');
  const document = paginationDocument(body);
  const full = layoutWordDocument(document, paginationMeasurer);
  for (const pageLimit of [1, 2, 3]) {
    const limited = layoutWordDocument(document, paginationMeasurer, { pageLimit });
    expect(limited.truncated).toBe(true);
    expect(limited.pages).toEqual(full.pages.slice(0, pageLimit));
  }
  expect(() => layoutWordDocument(document, paginationMeasurer, { maxFragments: 1 })).toThrow('fragment');
});
test('before spacing on the first paragraph does not create a blank page', () => {
  const body = paragraph('a'.repeat(21), '<w:spacing w:before="240" w:line="200" w:lineRule="exact"/>');
  const pages = textPages(body);
  expect(pages[0]!.length).toBeGreaterThan(0);
  expect(pages.flat().join('')).toBe('a'.repeat(21));
});
