import * as Y from 'yjs';
import { wordSnapshot } from './snapshot.ts';
import { wordLayoutSource } from './layout-source.ts';

export interface Checkpoint {
  snapshot: Y.Snapshot;
  roots: Map<string, unknown>;
  source: ReturnType<typeof wordLayoutSource>;
}
export function checkpoint(doc: Y.Doc): Checkpoint {
  return { snapshot: wordSnapshot(doc), roots: new Map(doc.share), source: wordLayoutSource(doc) };
}
export function matchesCheckpoint(doc: Y.Doc, value: Checkpoint) {
  return !doc.store.pendingStructs && !doc.store.pendingDs &&
    value.source === wordLayoutSource(doc) &&
    value.roots.size === doc.share.size &&
    [...value.roots].every(([name, root]) => doc.share.get(name) === root) &&
    Y.equalSnapshots(value.snapshot, wordSnapshot(doc));
}
