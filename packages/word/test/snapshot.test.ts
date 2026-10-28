import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import * as fc from 'fast-check';
import { wordSnapshot } from '../src/collaboration/snapshot.ts';

test('incremental checkpoints include unfinished and queued deletions without mutating older proofs', () => {
  fc.assert(fc.property(fc.array(fc.nat(100), { minLength: 10, maxLength: 40 }), actions => {
    const doc = new Y.Doc(), peer = new Y.Doc();
    const text = doc.getText('body');
    text.insert(0, 'first second\n', { bold: true });
    const proofs: { actual: Y.Snapshot; reference: Y.Snapshot }[] = [];
    const check = () => {
      const actual = wordSnapshot(doc), reference = Y.snapshot(doc);
      expect(Y.equalSnapshots(actual, reference)).toBe(true);
      for (const prior of proofs) expect(Y.equalSnapshots(prior.actual, prior.reference)).toBe(true);
      if (proofs.length < 4) proofs.push({ actual, reference });
    };
    // This runs before the incremental checkpoint's transaction observer.
    doc.on('beforeObserverCalls', check);
    text.observe(event => { void event.delta; check(); });
    try {
      check();
      for (const action of actions) {
        doc.transact(() => {
          check();
          const at = action % Math.max(1, text.length);
          if (action % 3 === 0 && text.length) text.delete(at, 1);
          else if (action % 3 === 1) text.insert(at, 'x', { bold: action % 2 === 0 });
          else doc.getMap('metadata').set('key', action);
          check();
          doc.transact(() => { doc.getMap('metadata').delete('key'); check(); });
        });
        check();
      }
      peer.getText('body');
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
      if (peer.getText('body').length) peer.getText('body').delete(0, 1);
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer));
      check();
    } finally { doc.destroy(); peer.destroy(); }
  }), { numRuns: 60 });
});
