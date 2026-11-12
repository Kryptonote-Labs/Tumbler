import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import * as fc from 'fast-check';
import { WordSharedText } from '../src/collaboration/structured/view.ts';
import { commitWordUpdate } from '../src/collaboration/structured/transactions.ts';
import type { WordDelta } from '../src/collaboration/commands.ts';

function fixture() {
  const doc = new Y.Doc();
  doc.getText('body').applyDelta([
    { insert: 'Hello 😀 ', attributes: { bold: true, wordSource: 4 } },
    { insert: 'world\n', attributes: { wordParagraph: 1 } },
  ]);
  return doc;
}

// Equivalent Y.Text values can split identical formatting into different adjacent runs.
function characters(text: Y.Text) {
  return text.toDelta().flatMap((part: { insert: unknown; attributes?: Record<string, unknown> }) => {
    const value: unknown = part.insert;
    if (typeof value !== 'string') throw new Error('Expected plain Word text.');
    const attributes: Record<string, unknown> = part.attributes ?? {};
    return value.split('').map(character => ({ character, attributes }));
  });
}

test('input rejects stale invalid state and observer mutations before the next edit', () => {
  const doc = fixture(), view = new WordSharedText(doc, 'body');
  try {
    view.applyDelta([{ insert: 'a' }]);
    doc.getText('body').observe(() => {
      doc.getMap('word-settings').set('finalSection:pageWidthTwips', -1);
    });
    view.applyDelta([{ insert: 'b' }]);
    const before = doc.getText('body').toDelta();
    expect(() => view.applyDelta([{ insert: 'c' }])).toThrow();
    expect(doc.getText('body').toDelta()).toEqual(before);
  } finally { view.destroy(); doc.destroy(); }
});

test('input revalidates invalid remote changes and preserves caller attributes', () => {
  const doc = fixture(), view = new WordSharedText(doc, 'body'), remote = new Y.Doc();
  try {
    const delta: WordDelta = [{ insert: 'a', attributes: { italic: true } }];
    const original = structuredClone(delta);
    view.applyDelta(delta);
    expect(delta).toEqual(original);
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    remote.getText('body').insert(0, '\u0001');
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote));
    const before = doc.getText('body').toDelta();
    expect(() => view.applyDelta([{ insert: 'b' }])).toThrow('control characters');
    expect(doc.getText('body').toDelta()).toEqual(before);
  } finally { view.destroy(); doc.destroy(); remote.destroy(); }
});
