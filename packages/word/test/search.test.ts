import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { createWordCommands, findWordMatches, replaceWordMatches } from '../src/collaboration/index.ts';

test('literal search handles case, whole words and grapheme boundaries', () => {
  expect(findWordMatches('Cat cats CAT', 'cat', { wholeWord: true })).toEqual([{ start: 0, end: 3 }, { start: 9, end: 12 }]);
  expect(findWordMatches('Cat cats CAT', 'CAT', { matchCase: true })).toEqual([{ start: 9, end: 12 }]);
  expect(findWordMatches('a.b a?b', 'a.b')).toEqual([{ start: 0, end: 3 }]);
  expect(findWordMatches('e\u0301 😀', 'e')).toEqual([]);
  expect(findWordMatches('e\u0301 😀', '😀')).toEqual([{ start: 3, end: 5 }]);
  expect(findWordMatches('x\n', '')).toEqual([]);
  expect(findWordMatches('x\ny', '\n')).toEqual([]);
});

test('replace all preserves unaffected formatting and is one undo operation', () => {
  const doc = new Y.Doc(); const text = doc.getText('body');
  text.insert(0, 'cat cat\n'); text.format(4, 3, { bold: true });
  const undo = new Y.UndoManager(text); const commands = createWordCommands();
  text.applyDelta(commands.wordTransaction(text, replaceWordMatches(text, 'cat', 'kitten')));
  expect(text.toString()).toBe('kitten kitten\n');
  expect(commands.wordFormats(text, { start: 7, end: 13 }).bold).toBe(true);
  undo.undo(); expect(text.toString()).toBe('cat cat\n');
  undo.redo(); expect(text.toString()).toBe('kitten kitten\n');
  doc.destroy();
});
