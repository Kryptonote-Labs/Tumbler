import * as Y from 'yjs';
import { wordLayoutSource } from '../layout-validation.ts';
import { isWordTextOnlyEdit } from '../text-range.ts';

interface Checkpoint {
  snapshot: Y.Snapshot;
  roots: Map<string, unknown>;
  source: ReturnType<typeof wordLayoutSource>;
}
export interface PreparedReplica {
  doc: Y.Doc;
  checkpoint?: Checkpoint;
  destroyed: boolean;
}
interface PreparationProof extends Checkpoint {
  owner: Y.Doc;
  update: Uint8Array;
  replica: PreparedReplica;
}
const replicas = new WeakMap<Y.Doc, PreparedReplica>();
// Key the original bytes, so wrappers adding a selection or range retain their proof.
const proofs = new WeakMap<Uint8Array, PreparationProof>();

export function checkpoint(doc: Y.Doc): Checkpoint {
  return { snapshot: Y.snapshot(doc), roots: new Map(doc.share), source: wordLayoutSource(doc) };
}
export function matchesCheckpoint(doc: Y.Doc, value: Checkpoint) {
  return !doc.store.pendingStructs && !doc.store.pendingDs &&
    value.source === wordLayoutSource(doc) &&
    value.roots.size === doc.share.size &&
    [...value.roots].every(([name, root]) => doc.share.get(name) === root) &&
    Y.equalSnapshots(value.snapshot, Y.snapshot(doc));
}
export function discardReplica(replica: PreparedReplica) {
  if (replica.destroyed) return;
  replica.destroyed = true;
  replica.doc.destroy();
}
/** Retain at most one validated replica per owner, including abandoned preparations. */
export function takeReplica(owner: Y.Doc) {
  const prior = replicas.get(owner);
  if (prior?.checkpoint && matchesCheckpoint(owner, prior.checkpoint)) {
    delete prior.checkpoint;
    return { replica: prior, validated: true };
  }
  if (prior) discardReplica(prior);
  const replica: PreparedReplica = { doc: new Y.Doc(), destroyed: false };
  replicas.set(owner, replica);
  if (!prior) owner.once('destroy', () => {
    const current = replicas.get(owner);
    if (current) discardReplica(current);
    replicas.delete(owner);
  });
  return { replica, validated: false };
}
export function provePreparation(owner: Y.Doc, before: Checkpoint, update: Uint8Array, replica: PreparedReplica) {
  proofs.set(update, { ...before, owner, replica, update: update.slice() });
}
export function consumePreparation(owner: Y.Doc, update: Uint8Array) {
  const proof = proofs.get(update);
  proofs.delete(update);
  if (!proof || proof.owner !== owner ||
    proof.update.length !== update.length ||
    !proof.update.every((value, index) => value === update[index]) ||
    !matchesCheckpoint(owner, proof)) return undefined;
  return proof;
}
export function retainCommittedReplica(owner: Y.Doc, proof: PreparationProof) {
  const replica = proof.replica;
  if (replica.destroyed || replicas.get(owner) !== replica) return;
  // Observers may change the owner while committing. Trust the validated replica's
  // snapshot, never the owner's resulting state, and compare them at the next preparation.
  replica.checkpoint = {
    snapshot: Y.snapshot(replica.doc), roots: new Map(owner.share), source: proof.source,
  };
}

/** An already validated replica needs a full check whenever structure or metadata changes. */
export function observeInlineEdit(candidate: Y.Doc, previous: Y.Doc) {
  const roots = new Map(candidate.share);
  let ordinary = true;
  const events = new Map<Y.Text, Y.YTextEvent['delta']>();
  const stops: (() => void)[] = [];
  for (const root of roots.values()) {
    if (!(root instanceof Y.Text)) continue;
    const observe = (event: Y.YTextEvent) => {
      if (event.keysChanged.size || events.has(root)) ordinary = false;
      events.set(root, event.delta);
    };
    root.observe(observe);
    stops.push(() => root.unobserve(observe));
  }
  const changed = (transaction: Y.Transaction) => {
    for (const root of transaction.changed.keys())
      if (!(root instanceof Y.Text) || !events.has(root)) ordinary = false;
  };
  candidate.on('afterTransaction', changed);
  return {
    stop() {
      for (const stop of stops) stop();
      candidate.off('afterTransaction', changed);
    },
    valid() {
      if (!ordinary || candidate.store.pendingStructs || candidate.store.pendingDs ||
        roots.size !== candidate.share.size ||
        [...roots].some(([name, root]) => candidate.share.get(name) !== root)) return false;
      for (const [name, root] of roots) {
        if (!(root instanceof Y.Text)) continue;
        const delta = events.get(root);
        if (delta && (delta.length > 3 || !isWordTextOnlyEdit(delta, previous.getText(name), true))) return false;
      }
      return true;
    },
  };
}
