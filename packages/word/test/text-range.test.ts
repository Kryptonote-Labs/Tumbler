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

test('optional inline formatting proofs validate values and exclude structural or source changes', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  text.insert(0, 'Text\n');
  try {
    const format = [{ retain: 4, attributes: { bold: true, color: '#123456', italic: null } }];
    expect(isWordTextOnlyEdit(format, text)).toBe(false);
    expect(isWordTextOnlyEdit(format, text, true)).toBe(true);
    for (const attributes of [{ wordSource: 12 }, { wordSource: null }, { paragraph: null }, { table: null }, { wordSection: null }])
      expect(isWordTextOnlyEdit([{ retain: 1, attributes }], text, true)).toBe(false);
    expect(() => isWordTextOnlyEdit([{ retain: 1, attributes: { bold: 'invalid' } }], text, true)).toThrow();
  } finally { doc.destroy(); }
});

test('indexed reads agree during nested writes, earlier observers, remote updates and undo', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  const other = new Y.Doc();
  const reads = () => {
    const actual = wordTextRange(text);
    expect(actual.map(part => part.insert).join('')).toBe(text.toString());
    const expand = (parts: { insert: string; attributes?: Record<string, unknown> }[]) =>
      parts.flatMap(part => Array.from({ length: part.insert.length }, (_, i) =>
        ({ text: part.insert[i], attributes: part.attributes ?? {} })));
    expect(expand(actual)).toEqual(expand(text.toDelta()));
    expect(wordTextRange(text, 2, 2)).toEqual([]);
  };
  text.insert(0, 'first\nsecond\n');
  // This observer runs before the index observer. It must read this transaction's data.
  text.observe(reads);
  reads();
  const undo = new Y.UndoManager(text);
  doc.transact(() => {
    text.insert(3, 'new', { italic: true });
    reads();
    text.format(0, 4, { bold: true });
    reads();
    text.delete(1, 3);
    reads();
  });
  reads();
  undo.undo(); reads();
  undo.redo(); reads();
  Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
  other.getText('body').insert(5, 'remote', { underline: true });
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(other));
  reads();
  doc.destroy(); other.destroy();
});

test('an index first read during a write is not advanced twice by that write', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  doc.transact(() => {
    text.insert(0, 'first');
    expect(wordTextRange(text).map(part => part.insert).join('')).toBe('first');
    text.insert(5, ' second\n');
  });
  expect(wordTextRange(text).map(part => part.insert).join('')).toBe('first second\n');
  doc.destroy();
});

test('fragmented ranges preserve every attribute across chunk boundaries, remote edits and undo', () => {
  const doc = new Y.Doc(), remote = new Y.Doc(), text = doc.getText('body');
  const undo = new Y.UndoManager(text, { captureTimeout: 0 });
  try {
    for (let index = 0; index < 210; index++)
      text.insert(text.length, `${index}xy\n`, { wordSource: index, bold: index % 2 === 0 });
    undo.clear();
    const expand = (parts: readonly { insert: string; attributes?: Readonly<Record<string, unknown>> }[]) =>
      parts.flatMap(part => Array.from({ length: part.insert.length }, (_, i) => ({ text: part.insert[i], attributes: part.attributes ?? {} })));
    const check = () => {
      const expected = expand(text.toDelta());
      expect(expand(wordTextRange(text))).toEqual(expected);
      for (const at of [0, 240, 260, 272, 500, 700, text.length - 4])
        expect(expand(wordTextRange(text, at, at + 4))).toEqual(expected.slice(at, at + 4));
    };
    check();
    text.delete(250, 50); check();
    text.insert(260, 'inserted', { wordSource: 500, italic: true }); check();
    text.format(260, 400, { bold: null, color: '#123456' }); check();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    remote.getText('body').delete(270, 250);
    remote.getText('body').insert(270, 'remote', { wordSource: 800 });
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote), 'remote'); check();
    undo.undo(); check(); undo.redo(); check();
  } finally { undo.destroy(); doc.destroy(); remote.destroy(); }
});

test('cached text validation rejects invalid remote text and still allows repairing it', async () => {
  const { createWordCommands, wordSharedText } = await import('../src/collaboration/index.ts');
  const doc = new Y.Doc(), commands = createWordCommands();
  const text = doc.getText('body');
  text.insert(0, 'valid\n');
  const view = wordSharedText(text);
  try {
    view.applyDelta(commands.replaceWordDelta(view.text, { start: 1, end: 1 }, 'x'));
    text.insert(0, '\u0001');
    expect(() => commands.replaceWordDelta(view.text, { start: 2, end: 2 }, 'a')).toThrow('control characters');
    const repair = commands.replaceWordDelta(view.text, { start: 0, end: 1 }, '');
    view.commit(view.prepareDelta(repair));
    expect(view.text.toString()).toBe('vxalid\n');
    expect(() => commands.replaceWordDelta(view.text, { start: 0, end: 0 }, '\ud800')).toThrow('incomplete character');
  } finally { doc.destroy(); }
});
