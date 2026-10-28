import { expect, test } from 'bun:test';
import { NativeWordDocument, type WordTextMeasurer } from '../src/index.ts';

const measure: WordTextMeasurer = {
  measure: text => ({ width: text.length * 6, ascent: 8, descent: 4 }),
};

test('shaped long words retain every character when a continuation enters a wider column', () => {
  const text = 'abcdefghij'.repeat(40);
  const model = new NativeWordDocument({
    defaultFormat: { fontFamily: 'Arial', fontSizePoints: 12, kerningPoints: 1 },
    page: { width: 220, height: 100, margin: 10 },
    content: [{ kind: 'paragraph', runs: [{ text }] }],
  });
  model.updateSettings({ finalSection: {
    columnCount: 2, columns: [{ widthTwips: 1200, spaceTwips: 200 }, { widthTwips: 2600, spaceTwips: 0 }],
  } });
  const layout = model.layout(measure);
  const lines = layout.pages.flatMap(page => page.columns.flatMap(column => {
    for (const line of column.lines) expect(line.width).toBeLessThanOrEqual(column.width);
    return column.lines;
  }));
  expect(layout.pages[0]!.columns.map(column => column.width)).toEqual([60, 130]);
  expect(lines.map(line => line.fragments.map(fragment => fragment.text).join('')).join('')).toBe(text);
  let offset = 0;
  for (const line of lines) { expect(line.startOffset).toBe(offset); offset = line.endOffset; }
  expect(offset).toBe(text.length);
});

test('previewing a very long word keeps shaping work bounded while retaining the full document', () => {
  const text = 'a'.repeat(100_000);
  let longest = 0;
  const model = new NativeWordDocument({
    defaultFormat: { fontFamily: 'Arial', fontSizePoints: 12, kerningPoints: 1 },
    page: { width: 100, height: 100, margin: 10 },
    content: [{ kind: 'paragraph', runs: [{ text }] }],
  });
  const result = model.layout({ measure(value, format) {
    longest = Math.max(longest, value.length);
    return measure.measure(value, format);
  } }, { pageLimit: 1, maxCharacters: 4000, maxAtoms: 4000, maxMeasurements: 2000 });
  expect(result.truncated).toBe(true);
  expect(result.pages).toHaveLength(1);
  expect(longest).toBeLessThan(100);
  expect(model.paragraphs()[0]!.text).toBe(text);
});
