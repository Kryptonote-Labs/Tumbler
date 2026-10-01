import { expect, test } from 'bun:test';
import { NativeWordDocument, layoutWordDocument, type WordContentBlock, type WordLayout } from '../src/index.ts';

const measurer = { measure: (text: string, format: { fontSizePoints: number }) => ({
  width: text.length * format.fontSizePoints / 2, ascent: format.fontSizePoints * 0.8, descent: format.fontSizePoints * 0.2,
}) };
const paragraph = (id: string, text: string): WordContentBlock => ({ kind: 'paragraph', id, runs: [{ text }] });
function geometry(layout: WordLayout): unknown {
  // Model-specific XML IDs and media names do not affect rendered appearance.
  return JSON.parse(JSON.stringify(layout, (key, value: unknown) =>
    ['elementId', 'paragraphElementId', 'runElementId', 'contentElementId', 'tableElementId',
      'cellElementId', 'continuationElementIds', 'drawing', 'section'].includes(key)
      ? undefined : typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value));
}
function compare(document: NativeWordDocument, measure = measurer) {
  expect(geometry(document.layout(measure))).toEqual(geometry(layoutWordDocument(document.artifact().document, measure)));
}

test('native rich content matches exported DOCX geometry', () => {
  const document = new NativeWordDocument({ defaultFormat: { fontFamily: 'Arial', fontSizePoints: 13 }, lineSpacing: 1.8 });
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64'));
  document.update([
    { kind: 'paragraph', runs: [{ text: 'Heading', format: { bold: true, fontSizePoints: 19.5 } }] },
    ...['First', '', 'Second'].map(text => ({ kind: 'paragraph' as const, runs: text ? [{ text }] : [], list: { id: 'list', kind: 'decimal' as const, start: 3 } })),
    { kind: 'table', rows: [[{ blocks: [paragraph('cell-a', 'A')] }, { blocks: [paragraph('cell-b', 'B')] }]] },
    { kind: 'paragraph', runs: [{ text: 'Before ' }, { text: '\uFFFC', image: { bytes: png, contentType: 'image/png', width: 72, height: 48, layout: 'front', alignment: 'center' } }, { text: ' after' }] },
  ]);
  compare(document);
  expect(document.paragraphs().at(-1)?.text).toBe('Before \uFFFC after');
});

test('stable IDs retain unchanged paragraphs across insertion and only measure changed content', () => {
  const document = new NativeWordDocument();
  const blocks = [paragraph('a', 'First'), paragraph('b', 'Second'), paragraph('c', 'Last')];
  document.update(blocks);
  document.layout(measurer);
  const before = document.blocks;
  const measured = document.cache.measuredParagraphs;
  document.update([paragraph('a', 'First changed'), paragraph('new', 'Inserted'), ...blocks.slice(1)]);
  compare(document);
  expect(document.blocks[2]).toBe(before[1]);
  expect(document.blocks[3]).toBe(before[2]);
  expect(document.cache.measuredParagraphs - measured).toBe(2);
});

test('cached pagination handles page movement, numbering and replacement font metrics', () => {
  const document = new NativeWordDocument();
  let blocks = Array.from({ length: 24 }, (_, i) => paragraph(String(i), `Paragraph ${i} ` + 'words with space '.repeat(12)));
  document.update(blocks);
  compare(document);
  const pages = document.layout(measurer).pages;
  expect(document.layout(measurer).pages[0]).toBe(pages[0]);
  blocks = [paragraph('0', 'aParagraph 0 ' + 'words with space '.repeat(12)), ...blocks.slice(1)];
  document.update(blocks);
  compare(document);
  expect(document.layout(measurer).pages.at(-1)).toBe(pages.at(-1));
  blocks = [paragraph('new', 'New paragraph '.repeat(50)), ...blocks.slice(2)];
  document.update(blocks);
  compare(document);
  document.update(blocks.map(block => block.kind === 'paragraph' ? { ...block, list: { id: 'ordered', kind: 'decimal' } } : block));
  compare(document);
  compare(document, { measure: (text, format) => ({ width: text.length * format.fontSizePoints * 0.7, ascent: 11, descent: 4 }) });
  expect(() => document.layout(measurer, { maxFragments: 1 })).toThrow();
});

test('invalid updates leave content and exported document unchanged', () => {
  const document = new NativeWordDocument();
  document.update([paragraph('a', 'Preserve')]);
  const before = document.blocks;
  expect(() => document.update([paragraph('a', 'Changed'), { kind: 'table', rows: [[]] }])).toThrow();
  expect(() => document.update([{ kind: 'table', id: 'a', rows: [[{ blocks: [paragraph('a', 'Duplicate')] }]] }])).toThrow('unique');
  expect(document.blocks).toBe(before);
  expect(document.paragraphs()[0]?.text).toBe('Preserve');
  compare(document);
});
