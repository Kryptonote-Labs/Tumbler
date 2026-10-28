import { hasQueuedWordTextChanges, wordTextChanged, wordTextDelta } from './text-events.ts';
import * as Y from "yjs";

const identities = new WeakMap<Y.Text, Map<number, string>>();
const origins = new WeakMap<Y.Text, () => Y.Text | undefined>();
const revisions = new WeakMap<Y.Text, { version: number; applied: WeakSet<Y.Transaction> }>();
const projections = new WeakMap<Y.Text, (at: number) => string>();

/** A local editing projection uses the identities of its authoritative paragraphs. */
export function setWordParagraphIdentity(
  text: Y.Text,
  project: ((at: number) => string) | undefined,
  source?: () => Y.Text | undefined,
) {
  if (source) origins.set(text, source);
  else origins.delete(text);
  if (project) projections.set(text, project);
  else projections.delete(text);
}

/** Track paragraph terminators through deltas instead of searching the CRDT from its start per line. */
export function wordParagraphIdentity(text: Y.Text, at: number): string {
  const project = projections.get(text);
  if (project) return project(at);
  let positions = identities.get(text);
  if (!positions) {
    positions = new Map();
    identities.set(text, positions);
    const revision = { version: 0, applied: new WeakSet<Y.Transaction>() };
    revisions.set(text, revision);
    text.observe((event) => {
      revision.version++;
      if (hasQueuedWordTextChanges(event)) {
        positions!.clear();
        revision.applied.add(event.transaction);
        return;
      }
      const previous = [...positions!.entries()].sort((a, b) => a[0] - b[0]);
      positions!.clear();
      let item = 0,
        before = 0,
        after = 0;
      const retain = (length: number) => {
        const end = before + length;
        while (item < previous.length && previous[item]![0] < end) {
          const [offset, id] = previous[item++]!;
          positions!.set(after + offset - before, id);
        }
        before = end;
        after += length;
      };
      for (const part of wordTextDelta(event)) {
        if (part.retain) retain(part.retain);
        if (part.delete) {
          before += part.delete;
          while (item < previous.length && previous[item]![0] < before) item++;
        }
        if (part.insert !== undefined)
          after += typeof part.insert === "string" ? part.insert.length : 1;
      }
      while (item < previous.length) {
        const [offset, id] = previous[item++]!;
        positions!.set(after + offset - before, id);
      }
      revision.applied.add(event.transaction);
    });
  }
  const revision = revisions.get(text), doc = text.doc;
  if (doc && revision && (doc._transaction && wordTextChanged(doc._transaction, text) || doc._transactionCleanups.some(transaction =>
    wordTextChanged(transaction, text) && !revision.applied.has(transaction)))) {
    const identity = Y.createRelativePositionFromTypeIndex(text, at).item;
    return identity ? `${identity.client}:${identity.clock}` : 'end';
  }
  let id = positions.get(at);
  if (id === undefined) {
    const identity = Y.createRelativePositionFromTypeIndex(text, at).item;
    id = identity ? `${identity.client}:${identity.clock}` : "end";
    positions.set(at, id);
  }
  return id;
}

/** A revision is reusable only after the authoritative identity observer has run. */
export function wordParagraphIdentityRevision(text: Y.Text): number | undefined {
  const origin = origins.get(text)?.();
  if (projections.has(text) && !origin) return undefined;
  const source = origin ?? text, doc = source.doc, revision = revisions.get(source);
  if (!doc || !revision) return undefined;
  const changed = (transaction: Y.Transaction) => [...transaction.changed.keys()].some(root => root instanceof Y.Text && root === source);
  if (doc._transaction && changed(doc._transaction) || doc._transactionCleanups.some(transaction => changed(transaction) && !revision.applied.has(transaction))) return undefined;
  return revision.version;
}
