import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import fc from 'fast-check';
import { syncWordView } from '../src/collaboration/structured/view-sync.ts';

const content = fc.array(fc.record({
  insert: fc.constantFrom('a', ' text ', '\n', '🦊', 'e\u0301'),
  attributes: fc.record({
    bold: fc.boolean(),
    wordSource: fc.nat(1000),
    extension: fc.record({ value: fc.string({ maxLength: 8 }) }),
  }),
}), { maxLength: 30 });

test('projection initialization and replacement preserve every attributed character', () => {
  fc.assert(fc.property(content, content, (before, after) => {
    const doc = new Y.Doc(), expected = new Y.Doc();
    try {
      const text = doc.getText('body');
      syncWordView(text, before);
      expected.getText('body').applyDelta(before);
      expect(text.toDelta()).toEqual(expected.getText('body').toDelta());
      expected.getText('body').delete(0, expected.getText('body').length);
      expected.getText('body').applyDelta(after);
      syncWordView(text, after);
      expect(text.toDelta()).toEqual(expected.getText('body').toDelta());
    } finally { doc.destroy(); expected.destroy(); }
  }), { numRuns: 150 });
});

test('formatting changes preserve retained identities, clear absent keys and leave input untouched', () => {
  const doc = new Y.Doc();
  try {
    const text = doc.getText('body');
    text.insert(0, 'First\nLast\n', { bold: true });
    const anchor = Y.createRelativePositionFromTypeIndex(text, 7);
    const next = [{ insert: 'First\n', attributes: { extension: { opaque: 'kept' } } }, { insert: 'Last\n' }];
    const original = structuredClone(next);
    syncWordView(text, next);
    expect(next).toEqual(original);
    expect(text.toDelta()).toEqual(next);
    expect(Y.createAbsolutePositionFromRelativePosition(anchor, doc)?.index).toBe(7);
    syncWordView(text, next);
    expect(Y.createAbsolutePositionFromRelativePosition(anchor, doc)?.index).toBe(7);
  } finally { doc.destroy(); }
});
