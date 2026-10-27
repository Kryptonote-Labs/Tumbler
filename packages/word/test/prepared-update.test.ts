import { expect, test } from 'bun:test';
import * as Y from 'yjs';
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

test('delete-only intervening edits require validation even within the same transaction', () => {
  const doc = fixture();
  try {
    const prepared = append(doc);
    const before = Y.encodeStateVector(doc);
    doc.transact(() => {
      doc.getText('body').delete(0, 1);
      expect(Y.encodeStateVector(doc)).toEqual(before);
      // A malformed edit to existing text can have no new structs either.
      doc.getText('body').insert(0, '\uFFFC', { field: 'PAGE' });
      doc.getText('body').delete(0, 1);
      commitWordUpdate(doc, prepared);
    });
    expect(doc.getText('body').toString()).toBe('ello! world\n');
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
