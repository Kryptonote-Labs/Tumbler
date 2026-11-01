import { expect, test } from 'bun:test';
import { textReplacement } from '../src/index.ts';
test('plain-input changes retain unchanged text and use UTF-16 document offsets', () => {
  expect(textReplacement('abc', 'abc')).toBeUndefined();
  expect(textReplacement('abc', 'abXYc')).toEqual({ start: 2, end: 2, value: 'XY' });
  expect(textReplacement('abc', 'ac')).toEqual({ start: 1, end: 2, value: '' });
  expect(textReplacement('', 'Notes\nMore')).toEqual({ start: 0, end: 0, value: 'Notes\nMore' });
  expect(textReplacement('Done', '')).toEqual({ start: 0, end: 4, value: '' });
});
test('emoji and combining-mark replacements stay on whole grapheme boundaries', () => {
  for (const [before, after] of [
    ['a😀z', 'a😁z'],
    ['cafe\u0301!', 'cafe\u0300!'],
    ['👨‍👩‍👧 hello', '👨‍👩‍👦 hello'],
  ] as const) {
    const change = textReplacement(before, after)!;
    expect(before.slice(0, change.start) + change.value + before.slice(change.end)).toBe(after);
    const boundaries = new Set([
      0,
      ...Array.from(
        new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(before),
        (segment) => segment.index + segment.segment.length,
      ),
    ]);
    expect(boundaries.has(change.start)).toBe(true);
    expect(boundaries.has(change.end)).toBe(true);
  }
  expect(textReplacement('a😀z', 'a😁z')).toEqual({ start: 1, end: 3, value: '😁' });
  expect(textReplacement('cafe\u0301!', 'cafe\u0300!')).toEqual({ start: 3, end: 5, value: 'e\u0300' });
  expect(() => textReplacement('valid', '\uD800')).toThrow('well-formed');
  expect(() => textReplacement('\uD800', '\uD800')).toThrow('well-formed');
});
