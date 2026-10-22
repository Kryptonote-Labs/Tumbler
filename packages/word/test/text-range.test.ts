import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { isWordTextOnlyEdit, wordTextRange, validateWordText } from '../src/collaboration/index.ts';

test('range reads preserve text and effective attributes through deleted CRDT items', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  text.insert(0, 'before 😀 after\n');
  text.format(2, 7, { bold: true });
  text.delete(3, 2);
  text.insert(4, 'new', { italic: true });
  const value = text.toString();
  for (let start = 0; start <= value.length; start++) {
    for (let end = start; end <= value.length; end++) {
      const actual = wordTextRange(text, start, end);
      expect(actual.map((part) => part.insert).join('')).toBe(value.slice(start, end));
      let offset = 0;
      const expected = text.toDelta().flatMap((part: { insert?: unknown; attributes?: Record<string, unknown> }) => {
        const insert = String(part.insert);
        const from = Math.max(0, start - offset),
          to = Math.min(insert.length, end - offset);
        offset += insert.length;
        return to > from
          ? Array.from({ length: to - from }, (_, index) => ({
              value: insert[from + index],
              attributes: part.attributes ?? {},
            }))
          : [];
      });
      const expanded = actual.flatMap((part) =>
        Array.from({ length: part.insert.length }, (_, index) => ({
          value: part.insert[index],
          attributes: part.attributes ?? {},
        })),
      );
      expect(expanded).toEqual(expected);
    }
  }
  doc.destroy();
});

test('ordinary edits preserve validation; structural and formatting edits require full validation', () => {
  for (const [value, mutate, ordinary] of [
    ['hello\n', (text: Y.Text) => text.insert(2, '😀', { bold: true }), true],
    ['hello\n', (text: Y.Text) => text.delete(1, 2), true],
    ['a😀b\n', (text: Y.Text) => text.delete(1, 1), false],
    ['hello\n', (text: Y.Text) => text.insert(2, '\n'), false],
    ['hello\n', (text: Y.Text) => text.delete(5, 1), false],
    ['hello\n', (text: Y.Text) => text.format(0, 1, { bold: true }), false],
    ['hello\n', (text: Y.Text) => text.insert(0, '\uFFFC'), false],
    ['\uFFFChello\n', (text: Y.Text) => text.delete(0, 1), false],
    ['hello\n', (text: Y.Text) => text.insert(0, 'x', { table: {} }), false],
  ] as const) {
    const before = new Y.Doc();
    before.getText('body').insert(0, value);
    const after = new Y.Doc();
    Y.applyUpdate(after, Y.encodeStateAsUpdate(before));
    let result: boolean | undefined;
    after.getText('body').observe((event) => {
      result = isWordTextOnlyEdit(event.delta, before.getText('body'));
    });
    mutate(after.getText('body'));
    expect(result).toBe(ordinary);
    if (ordinary) expect(() => validateWordText(after.getText('body'))).not.toThrow();
    before.destroy();
    after.destroy();
  }
});

test('ordinary edit proof rejects invalid inserted text and inline attributes', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  text.insert(0, 'valid\n');
  expect(() => isWordTextOnlyEdit([{ insert: '\u0001' }], text)).toThrow('control characters');
  expect(() => isWordTextOnlyEdit([{ insert: '\ud800' }], text)).toThrow('incomplete character');
  expect(() =>
    isWordTextOnlyEdit([{ insert: 'x', attributes: { bold: 'invalid' } }], text),
  ).toThrow('formatting');
  doc.destroy();
});
