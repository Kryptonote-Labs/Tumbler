import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { writeWordDocumentSettings } from '../src/collaboration/document-settings.ts';
import { stageWordUpdate, commitWordUpdate } from '../src/collaboration/structured/transactions.ts';

function fixture() {
  const doc = new Y.Doc();
  doc.getText('body').insert(0, 'Hello world\n');
  return doc;
}
const append = (doc: Y.Doc) => stageWordUpdate(doc, candidate => {
  candidate.getText('body').insert(5, '!');
  return undefined;
});

test('locally validated updates commit atomically inside an enclosing transaction', () => {
  const doc = fixture();
  try {
    doc.transact(() => commitWordUpdate(doc, append(doc)), 'typing');
    expect(doc.getText('body').toString()).toBe('Hello! world\n');
  } finally { doc.destroy(); }
});

test('delete-only intervening invalid edits require validation within the same transaction', () => {
  const doc = fixture();
  try {
    writeWordDocumentSettings(doc, { finalSection: {
      pageWidthTwips: 1500, marginLeftTwips: 100, marginRightTwips: 100,
    } });
    const prepared = append(doc);
    const before = Y.encodeStateVector(doc);
    doc.transact(() => {
      doc.getMap('word-settings').delete('finalSection:marginLeftTwips');
      expect(Y.encodeStateVector(doc)).toEqual(before);
      expect(() => commitWordUpdate(doc, prepared)).toThrow('no text area');
    });
  } finally { doc.destroy(); }
});

test('intervening invalid state and modified prepared bytes are never trusted', () => {
  const doc = fixture();
  try {
    const prepared = append(doc);
    const peer = fixture();
    try {
      peer.getText('body').insert(0, '\u0001');
      Reflect.set(prepared, 'update', Y.encodeStateAsUpdate(peer));
      expect(() => commitWordUpdate(doc, prepared)).toThrow();
      expect(doc.getText('body').toString()).toBe('Hello world\n');
    } finally { peer.destroy(); }
    const next = append(doc);
    doc.getText('body').insert(0, '\u0001');
    expect(() => commitWordUpdate(doc, next)).toThrow();
    expect(doc.getText('body').toString()).toBe('\u0001Hello world\n');
  } finally { doc.destroy(); }
});

test('serialized preparations and a different owner receive full validation', () => {
  const doc = fixture(), peer = fixture();
  try {
    const prepared = append(doc);
    doc.getText('body').insert(0, '\u0001');
    expect(() => commitWordUpdate(doc, { update: prepared.update })).toThrow();
    peer.getText('body').insert(0, '\u0001');
    expect(() => commitWordUpdate(peer, prepared)).toThrow();
  } finally { doc.destroy(); peer.destroy(); }
});

test('reused preparations preserve read-only staging, aborts, wrappers and received changes', () => {
  const doc = fixture();
  try {
    for (let i = 0; i < 20; i++) {
      const before = doc.getText('body').toString();
      const prepared = append(doc);
      expect(doc.getText('body').toString()).toBe(before);
      commitWordUpdate(doc, { ...prepared, selection: { story: 'body', range: { start: 6, end: 6 } } });
      expect(doc.getText('body').toString()).toBe(before.slice(0, 5) + '!' + before.slice(5));
    }
    append(doc); // An abandoned preparation must never leak into its replacement.
    const prepared = append(doc);
    const before = doc.getText('body').toString();
    commitWordUpdate(doc, prepared);
    expect(doc.getText('body').toString()).toBe(before.slice(0, 5) + '!' + before.slice(5));
    const peer = new Y.Doc();
    try {
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
      const vector = Y.encodeStateVector(peer);
      peer.getText('body').insert(0, 'remote');
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer, vector));
      commitWordUpdate(doc, append(doc));
      expect(doc.getText('body').toString().startsWith('remot!e')).toBe(true);
    } finally { peer.destroy(); }
  } finally { doc.destroy(); }
});

test('a reused replica fully validates structure, metadata and invalid inline content', () => {
  const doc = fixture();
  try {
    commitWordUpdate(doc, append(doc));
    expect(() => stageWordUpdate(doc, candidate => {
      candidate.getText('body').insert(0, '\u0001');
      return undefined;
    })).toThrow();
    commitWordUpdate(doc, append(doc));
    expect(() => stageWordUpdate(doc, candidate => {
      candidate.getText('body').format(0, 1, { field: 'PAGE' });
      return undefined;
    })).toThrow();
    commitWordUpdate(doc, append(doc));
    expect(() => stageWordUpdate(doc, candidate => {
      candidate.getMap('word-settings').set('finalSection:pageWidthTwips', -1);
      return undefined;
    })).toThrow();
    commitWordUpdate(doc, append(doc));
    expect(() => stageWordUpdate(doc, candidate => {
      candidate.getText('new-story').insert(0, '\u0001');
      return undefined;
    })).toThrow();
    expect(doc.getText('body').toString()).not.toContain('\u0001');
    expect(doc.share.has('new-story')).toBe(false);
  } finally { doc.destroy(); }
});

test('mutating the original while committing invalidates the cached replica', () => {
  const doc = fixture();
  try {
    const mutate = () => doc.getText('body').insert(0, '\u0001');
    doc.once('update', mutate);
    commitWordUpdate(doc, append(doc));
    expect(() => append(doc)).toThrow();
  } finally { doc.destroy(); }
});

test('mutated bytes in a wrapped preparation never bypass validation', () => {
  const doc = fixture();
  try {
    commitWordUpdate(doc, append(doc));
    const prepared = stageWordUpdate(doc, candidate => {
      candidate.getText('body').insert(0, 'x');
      return undefined;
    });
    // Change the inserted character without changing the update object's identity or length.
    const position = prepared.update.lastIndexOf('x'.charCodeAt(0));
    expect(position).toBeGreaterThan(0);
    prepared.update[position] = 1;
    expect(() => commitWordUpdate(doc, { ...prepared })).toThrow();
    expect(doc.getText('body').toString().startsWith('Hello')).toBe(true);
  } finally { doc.destroy(); }
});

test('cached and fully revalidated edits agree across generated edit sequences', async () => {
  const fc = await import('fast-check');
  fc.assert(fc.property(fc.array(fc.record({
    kind: fc.constantFrom('insert', 'delete', 'bold', 'invalid-field'),
    at: fc.nat(100), text: fc.constantFrom('a', 'é', '中', '😀', '\n', '\u0001'),
  }), { minLength: 5, maxLength: 30 }), actions => {
    const cached = fixture(), full = new Y.Doc();
    Y.applyUpdate(full, Y.encodeStateAsUpdate(cached));
    full.getText('body');
    try {
      for (const action of actions) {
        const apply = (doc: Y.Doc) => {
          const text = doc.getText('body');
          const at = action.at % text.length;
          if (action.kind === 'insert') text.insert(at, action.text);
          else if (action.kind === 'delete') text.delete(at, 1);
          else text.format(at, 1, action.kind === 'bold' ? { bold: true } : { field: 'PAGE' });
          return undefined;
        };
        const outcomes = [cached, full].map((doc, index) => {
          const before = doc.getText('body').toDelta();
          try {
            const prepared = stageWordUpdate(doc, apply);
            commitWordUpdate(doc, index ? { update: prepared.update.slice() } : prepared);
            return 'accepted';
          } catch {
            expect(doc.getText('body').toDelta()).toEqual(before);
            return 'rejected';
          }
        });
        expect(outcomes[0]).toBe(outcomes[1]);
        expect(cached.getText('body').toDelta()).toEqual(full.getText('body').toDelta());
      }
    } finally { cached.destroy(); full.destroy(); }
  }), { numRuns: 80 });
});

test('staging retains formatting inheritance at a rich-text boundary', () => {
  const doc = fixture();
  try {
    commitWordUpdate(doc, stageWordUpdate(doc, candidate => {
      candidate.getText('body').format(0, 1, { bold: true });
      return undefined;
    }));
    const prepared = stageWordUpdate(doc, candidate => {
      candidate.getText('body').insert(1, '!');
      return undefined;
    });
    commitWordUpdate(doc, prepared);
    expect(doc.getText('body').toDelta()).toEqual([
      { insert: 'H!', attributes: { bold: true } }, { insert: 'ello world\n' },
    ]);
  } finally { doc.destroy(); }
});
