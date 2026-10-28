import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import * as fc from 'fast-check';
import { applyTrackedWordDelta, wordTextDelta } from '../src/collaboration/text-events.ts';
import { WordParagraphProjection } from '../src/collaboration/paragraph-projection.ts';
import type { WordDelta } from '../src/collaboration/commands.ts';

function seed() {
  const doc = new Y.Doc();
  doc.clientID = 101;
  doc.getText('body').insert(0, 'prefix comparable suffix\n', { bold: true, wordSource: 8 });
  return doc;
}
function clone(doc: Y.Doc, client: number) {
  const next = new Y.Doc();
  next.getText('body');
  Y.applyUpdate(next, Y.encodeStateAsUpdate(doc));
  next.clientID = client;
  return next;
}

test('formatted string edits produce the same wire state as Y.Text, including a new client string end', () => {
  const original = seed(), fast = clone(original, 202), normal = clone(original, 202);
  try {
    const deltas: WordDelta[] = [
      [{ retain: 5 }, { insert: 'xx', attributes: { bold: true, wordSource: 8 } }],
      [{ retain: 6 }, { delete: 1 }],
      [{ retain: 6 }, { insert: 'y', attributes: { bold: true, wordSource: 8 } }],
      [{ retain: 9 }, { delete: 2 }],
    ];
    for (const delta of deltas) {
      applyTrackedWordDelta(fast.getText('body'), delta);
      normal.getText('body').applyDelta(structuredClone(delta));
      expect(fast.getText('body').toDelta()).toEqual(normal.getText('body').toDelta());
      expect(Y.encodeStateAsUpdate(fast)).toEqual(Y.encodeStateAsUpdate(normal));
    }
  } finally { original.destroy(); fast.destroy(); normal.destroy(); }
});

test('known deltas and paragraph projections agree with actual Yjs text through generated edits', () => {
  fc.assert(fc.property(fc.array(fc.record({ at: fc.nat(100), kind: fc.nat(3) }), { minLength: 10, maxLength: 35 }), actions => {
    const doc = seed(), text = doc.getText('body');
    const projection = new WordParagraphProjection(text, slice => slice.parts);
    let previous = text.toDelta();
    text.observe(event => {
      const apply = (delta: Y.YTextEvent['delta']) => {
        const replica = new Y.Doc(), target = replica.getText('body');
        try {
          target.applyDelta(structuredClone(previous));
          target.applyDelta(structuredClone(delta));
          return target.toDelta();
        } finally { replica.destroy(); }
      };
      // Yjs can include redundant attribute removals on an unchanged suffix.
      expect(apply(wordTextDelta(event))).toEqual(apply(event.delta));
      previous = text.toDelta();
    });
    try {
      for (const action of actions) {
        const at = action.at % text.length;
        const delta: WordDelta = [...(at ? [{ retain: at }] : []),
          ...(action.kind === 0 ? [{ insert: 'xy', attributes: { bold: true, wordSource: 8 } }]
            : action.kind === 1 ? [{ delete: 1 }]
            : [{ retain: 1, attributes: { italic: action.kind === 2 ? true : null } }])];
        applyTrackedWordDelta(text, delta);
        const expand = (parts: readonly { insert: string; attributes?: Readonly<Record<string, unknown>> }[]) =>
          parts.flatMap(part => Array.from({ length: part.insert.length }, (_, i) => ({ text: part.insert[i], attributes: part.attributes ?? {} })));
        expect(expand(projection.paragraphs.flat())).toEqual(expand(text.toDelta()));
      }
    } finally { projection.destroy(); doc.destroy(); }
  }), { numRuns: 80 });
});

test('combined and earlier observer edits use their complete actual delta', () => {
  const doc = seed(), text = doc.getText('body');
  let mutate = true;
  text.observe(() => {
    if (!mutate) return;
    mutate = false;
    text.insert(0, 'observer');
  });
  text.observe(event => { expect(wordTextDelta(event)).toEqual(event.delta); });
  try {
    doc.transact(() => {
      applyTrackedWordDelta(text, [{ insert: 'a' }]);
      applyTrackedWordDelta(text, [{ retain: 1 }, { insert: 'b' }]);
    });
    expect(text.toString()).toBe('observerabprefix comparable suffix\n');
  } finally { doc.destroy(); }
});

test('native and standard clients converge through concurrent formatting, edits and undo', () => {
  for (const reverse of [false, true]) {
    const original = seed(), native = clone(original, 202), standard = clone(original, 303);
    const text = native.getText('body'), other = standard.getText('body');
    const projection = new WordParagraphProjection(text, slice => slice.parts);
    const undo = new Y.UndoManager(text, { captureTimeout: 0 });
    const updates = [new Y.Doc(), new Y.Doc()];
    try {
      applyTrackedWordDelta(text, [{ retain: 5 }, { insert: 'local', attributes: { bold: true, wordSource: 8 } }]);
      applyTrackedWordDelta(text, [{ retain: 7 }, { delete: 2 }]);
      other.insert(5, 'remote', { italic: true, wordSource: 8 });
      other.format(3, 11, { underline: true });
      const states = [Y.encodeStateAsUpdate(native), Y.encodeStateAsUpdate(standard)];
      for (const update of reverse ? [...states].reverse() : states)
        for (const replica of updates) Y.applyUpdate(replica, update);
      Y.applyUpdate(native, states[1]!, 'remote');
      Y.applyUpdate(standard, states[0]!);
      const agree = () => {
        expect(text.toDelta()).toEqual(other.toDelta());
        const expand = (parts: readonly { insert: string; attributes?: Readonly<Record<string, unknown>> }[]) =>
          parts.flatMap(part => Array.from({ length: part.insert.length }, (_, i) => ({ text: part.insert[i], attributes: part.attributes ?? {} })));
        expect(expand(projection.paragraphs.flat())).toEqual(expand(text.toDelta()));
      };
      agree();
      for (const replica of updates) expect(replica.getText('body').toDelta()).toEqual(text.toDelta());
      for (const action of [() => undo.undo(), () => undo.undo(), () => undo.redo(), () => undo.redo()]) {
        action();
        Y.applyUpdate(standard, Y.encodeStateAsUpdate(native));
        agree();
        expect(text.toString()).toContain('remote');
        for (const part of text.toDelta()) expect(part.attributes?.wordSource).toBe(8);
      }
    } finally {
      projection.destroy(); undo.destroy(); original.destroy(); native.destroy(); standard.destroy();
      for (const replica of updates) replica.destroy();
    }
  }
});
