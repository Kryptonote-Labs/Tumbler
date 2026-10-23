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
test('ordinary line breaks retain first and last widow protection', () => {
  const lines = (count: number) => paragraph(Array.from({ length: count }, (_, i) => String(i)).join('</w:t><w:br/><w:t>'));
  expect(textPages(paragraph('filler1') + paragraph('filler2') + lines(3)).map(page => page.length)).toEqual([2, 3]);
  expect(textPages(lines(4)).map(page => page.length)).toEqual([2, 2]);
});
test('predecessor spacing stays behind when a keep chain or page break moves', () => {
  const filler = paragraph('filler', '<w:spacing w:after="240" w:line="200" w:lineRule="exact"/>');
  expect(textPages(filler + paragraph('heading', '<w:keepNext/>') + paragraph('end'))).toEqual([['filler'], ['heading', 'end']]);
  const document = paginationDocument(filler + paragraph('next', '<w:pageBreakBefore/>'));
  expect(layoutWordDocument(document, paginationMeasurer).pages[1]!.columns[0]!.lines[0]!.y).toBe(10);
});
test('three-line paragraphs keep both ends together when a fresh column fits all three', () => {
  for (const text of ['a'.repeat(41), 'a</w:t><w:br/><w:t>b</w:t><w:br/><w:t>c']) {
    expect(textPages(paragraph('filler') + paragraph(text)).map(page => page.length)).toEqual([1, 3]);
  }
});
test('a preflight move reprepares at the destination column width', () => {
  const document = paginationDocument(paragraph('filler', section('', 6000)) + paragraph('abcdefghijklmno', '<w:pageBreakBefore/>'), section('<w:type w:val="continuous"/><w:cols w:num="2" w:space="200"/>', 6000));
  const column = layoutWordDocument(document, paginationMeasurer).pages[1]!.columns[0]!;
  expect(column.lines.map(line => line.fragments.map(fragment => fragment.text).join(''))).toEqual(['abcdefghi', 'jklmno']);
  expect(column.lines.every(line => line.width <= column.width)).toBe(true);
});
test('lookahead rewraps after an inline break changes column width', () => {
  const body = paragraph('filler', section('', 6000)) + paragraph('heading</w:t><w:br w:type="page"/><w:t>tail', '<w:keepNext/>') + paragraph('abcdefghijklmno');
  const document = paginationDocument(body, section('<w:type w:val="continuous"/><w:cols w:num="2" w:space="200"/>', 6000));
  const column = layoutWordDocument(document, paginationMeasurer).pages[1]!.columns[0]!;
  expect(column.lines.slice(-2).map(line => line.fragments.map(fragment => fragment.text).join(''))).toEqual(['abcdefghi', 'jklmno']);
  expect(column.lines.every(line => line.width <= column.width)).toBe(true);
});
test('keep lookahead stops at explicit page and column breaks', () => {
  for (const kind of ['page', 'column']) {
    const body = paragraph('filler') + paragraph(`heading</w:t><w:br w:type="${kind}"/><w:t>tail`, '<w:keepNext/>') + paragraph('end');
    const document = paginationDocument(body, section(kind === 'column' ? '<w:cols w:num="2" w:space="0"/>' : ''));
    const columns = layoutWordDocument(document, paginationMeasurer).pages.flatMap(page => page.columns.map(column => column.lines.map(line => line.fragments.map(fragment => fragment.text).join(''))));
    expect(columns).toEqual([['filler', 'heading'], ['tail', 'end']]);
  }
});
test('keepNext without an eligible successor does not imply keepLines', () => {
  const filler = paragraph('filler');
  const text = 'a'.repeat(61);
  expect(textPages(filler + paragraph(text, '<w:keepNext/>'))).toEqual(textPages(filler + paragraph(text)));
  const forced = paragraph('next', '<w:pageBreakBefore/>');
  expect(textPages(filler + paragraph(text, '<w:keepNext/>') + forced)).toEqual(textPages(filler + paragraph(text) + forced));
  expect(textPages(filler + paragraph(text, '<w:keepNext/><w:keepLines/>')).map(page => page.length)).toEqual([1, 2, 2]);
});
test('keep chains cross compatible continuous sections but stop at forced boundaries', () => {
  for (const extra of ['', '<w:keepLines/>']) {
    const body = paragraph('filler1') + paragraph('filler2') + paragraph('heading', '<w:keepNext/>' + extra + section()) + paragraph('following');
    const document = paginationDocument(body, section('<w:type w:val="continuous"/>'));
    expect(layoutWordDocument(document, paginationMeasurer).pages.map(page => page.columns.flatMap(column => column.lines.map(line => line.fragments.map(fragment => fragment.text).join(''))))).toEqual([['filler1', 'filler2'], ['heading', 'following']]);
  }
  const body = paragraph('filler') + paragraph('h1', '<w:keepNext/>' + section()) + paragraph('h2', '<w:keepNext/>' + section('<w:type w:val="continuous"/>')) + paragraph('end');
  expect(layoutWordDocument(paginationDocument(body, section('<w:type w:val="continuous"/>')), paginationMeasurer).pages.map(page => page.columns[0]!.lines.length)).toEqual([1, 3]);
  const forced = paragraph('filler1') + paragraph('filler2') + paragraph('heading', '<w:keepNext/>' + section()) + paragraph('following');
  expect(layoutWordDocument(paginationDocument(forced), paginationMeasurer).pages.map(page => page.columns[0]!.lines.length)).toEqual([3, 1]);
});
