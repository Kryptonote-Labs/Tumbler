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

test('inline input and fully staged edits agree across generated rich-text sequences', () => {
  fc.assert(fc.property(fc.array(fc.record({
    kind: fc.constantFrom('insert', 'delete', 'format'), at: fc.nat(100),
    text: fc.constantFrom('a', 'é', '中', '😀', '\n', '\u0001'),
    bold: fc.boolean(),
  }), { minLength: 5, maxLength: 25 }), actions => {
    const direct = fixture(), staged = new Y.Doc();
    staged.getText('body');
    Y.applyUpdate(staged, Y.encodeStateAsUpdate(direct));
    const views = [direct, staged].map(doc => new WordSharedText(doc, 'body'));
    try {
      for (const action of actions) {
        const at = action.at % direct.getText('body').length;
        const delta: WordDelta = [
          ...(at ? [{ retain: at }] : []),
          ...(action.kind === 'insert' ? [{ insert: action.text, attributes: { italic: true } }]
            : action.kind === 'delete' ? [{ delete: 1 }]
            : [{ retain: 1, attributes: { bold: action.bold } }]),
        ];
        const outcomes = views.map((view, i) => {
          const before = view.sourceText.toDelta();
          try {
            view.doc.transact(() => {
              if (i === 0) view.applyDelta(delta, 'typing');
              else commitWordUpdate(view.doc, view.prepareDelta(delta), 'typing');
            }, 'typing');
            return 'accepted';
          } catch {
            expect(view.sourceText.toDelta()).toEqual(before);
            return 'rejected';
          }
        });
        expect(outcomes[0]).toBe(outcomes[1]);
        expect(direct.getText('body').toDelta()).toEqual(staged.getText('body').toDelta());
        expect(views[0]!.text.toDelta()).toEqual(views[1]!.text.toDelta());
      }
    } finally { views.forEach(view => view.destroy()); direct.destroy(); staged.destroy(); }
  }), { numRuns: 80 });
});

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
