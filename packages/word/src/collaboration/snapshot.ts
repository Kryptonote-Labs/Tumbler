import * as Y from 'yjs';

type DeleteSet = ReturnType<typeof Y.createDeleteSet>;
const deletions = new WeakMap<Y.Doc, DeleteSet>();

/** Exact checkpoints need clocks and deletions, not another walk over every CRDT struct.
 * Completed deletion sets accumulate from transaction events. Include unfinished and queued
 * transactions explicitly so deletion-only edits inside an outer transaction remain visible.
 */
export function wordSnapshot(doc: Y.Doc): Y.Snapshot {
  let deleted = deletions.get(doc);
  if (!deleted) {
    deleted = Y.createDeleteSetFromStructStore(doc.store);
    deletions.set(doc, deleted);
    doc.on('beforeObserverCalls', transaction => {
      if (!transaction.deleteSet.clients.size) return;
      const combined = merge([deletions.get(doc)!, transaction.deleteSet]);
      deletions.set(doc, combined);
    });
  }
  const pending = [...doc._transactionCleanups];
  if (doc._transaction && !pending.includes(doc._transaction)) pending.push(doc._transaction);
  const ds = merge([deleted, ...pending.map(transaction => transaction.deleteSet)]);
  const sv = new Map<number, number>();
  for (const client of doc.store.clients.keys()) sv.set(client, Y.getState(doc.store, client));
  return Y.createSnapshot(ds, sv);
}

function merge(input: readonly DeleteSet[]): DeleteSet {
  // Yjs coalesces ranges in place. Neither retained proofs nor a transaction's own
  // deletion set may be changed while another checkpoint is being constructed.
  return Y.mergeDeleteSets(input.map(value => {
    const copy = Y.createDeleteSet();
    for (const [client, ranges] of value.clients)
      copy.clients.set(client, ranges.map(range => ({ clock: range.clock, len: range.len })));
    return copy;
  }));
}
