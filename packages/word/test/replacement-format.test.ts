import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { createWordCommands } from '../src/collaboration/index.ts';

const commands = createWordCommands();

test('replacement format patches inherited text and paragraphs in one undoable delta', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  text.insert(0, 'Before old after\n', { font: 'Calibri', italic: true });
  const before = text.toDelta();
  const target = commands.anchorWordRange(text, { start: 7, end: 10 });
  const undo = new Y.UndoManager(text);
  const delta = commands.wordTransaction(text, [{
    kind: 'replace', target, expected: 'old', value: 'longer\r\ntext',
    format: { bold: true, italic: null, align: 'center' },
  }]);
  expect(text.toDelta()).toEqual(before);
  text.applyDelta(delta);
  expect(text.toString()).toBe('Before longer\ntext after\n');
  expect(commands.wordFormats(text, { start: 7, end: 13 })).toMatchObject({ bold: true, font: 'Calibri' });
  expect(commands.wordFormats(text, { start: 7, end: 13 }).italic).toBeUndefined();
  expect(commands.wordFormats(text, { start: 14, end: 18 }).bold).toBe(true);
  expect(commands.wordFormats(text, { start: 18, end: 24 }).bold).toBeUndefined();
  const terminators = text.toDelta().filter((run: { insert?: unknown }) => run.insert === '\n');
  expect(terminators).toHaveLength(2);
  for (const run of terminators) expect(run.attributes?.align).toBe('center');
  undo.undo();
  expect(text.toDelta()).toEqual(before);
  undo.destroy();
  doc.destroy();
});

test('invalid formatting and empty replacement formatting fail without modifying text', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  text.insert(0, 'old\n');
  const target = commands.anchorWordRange(text, { start: 0, end: 3 });
  const before = text.toDelta();
  for (const change of [
    { value: 'new', format: { fontSize: -1 } },
    { value: '', format: { bold: true } },
  ]) {
    expect(() => commands.wordTransaction(text, [{ kind: 'replace', target, ...change }])).toThrow();
    expect(text.toDelta()).toEqual(before);
  }
  doc.destroy();
});


test('selection defaults resolve each paragraph and replacement inherits its style', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  text.insert(0, 'Heading\nBody\n');
  const commands = createWordCommands({ defaultAttributes: (_text, range) => range.start < 8 ? { fontSize: 20, bold: true } : { fontSize: 12, bold: false } });
  expect(commands.wordFormats(text, { start: 7, end: 7 })).toMatchObject({ fontSize: 20, bold: true });
  expect(commands.wordFormats(text, { start: 8, end: 8 })).toMatchObject({ fontSize: 12, bold: false });
  expect(commands.wordFormats(text, { start: 0, end: 12 }).fontSize).toBeUndefined();
  expect(commands.wordFormats(text, { start: 0, end: 12 }).bold).toBeUndefined();
  text.applyDelta(commands.replaceWordDelta(text, { start: 7, end: 7 }, '!'));
  expect(commands.wordFormats(text, { start: 7, end: 8 })).toMatchObject({ fontSize: 20, bold: true });
  doc.destroy();
});
