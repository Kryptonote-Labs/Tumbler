import { editWordTextItem } from './text-edit.ts';
import * as Y from 'yjs';
import { checkpoint, matchesCheckpoint } from './structured/preparation-cache.ts';
import { wordTextIndex } from './text-index.ts';
import type { WordDelta } from './commands.ts';

type Delta = Y.YTextEvent['delta'];
interface RecordedEdit {
  after: ReturnType<typeof checkpoint>;
  delta: Delta;
}
const edits = new WeakMap<Y.Transaction, Map<Y.Text, RecordedEdit>>();
const observed = new WeakMap<Y.YTextEvent, Delta>();

/** Reuse a normalized, equivalent local delta at the exact state produced by that write.
 * This leaves Yjs events and their public getters untouched. Other transactions,
 * earlier observer writes and combined edits use Yjs's general delta calculation.
 */
export function wordTextDelta(event: Y.YTextEvent): Delta {
  const previous = observed.get(event);
  if (previous) return previous;
  const edit = edits.get(event.transaction)?.get(event.target);
  const delta = edit && event.target.doc && !event.keysChanged.size &&
    matchesCheckpoint(event.target.doc, edit.after) ? edit.delta : event.delta;
  observed.set(event, delta);
  return delta;
}

/** Apply already checked plain-text input, recording its effective formatting for observers. */
export function applyTrackedWordDelta(text: Y.Text, delta: WordDelta) {
  const doc = text.doc;
  if (!doc) throw new Error('The document is not attached.');
  let after: ReturnType<typeof checkpoint> | undefined;
  doc.transact(transaction => {
    const alone = ![...transaction.changed.keys()].some(root => root instanceof Y.Text && root === text);
    const normalized = alone ? normalizeDelta(text, delta) : undefined;
    if (!alone || !editWordTextItem(text, delta, transaction)) text.applyDelta(delta.map(part => ({ ...part,
      ...(part.attributes ? { attributes: { ...part.attributes } } : {}),
    })));
    const recorded = edits.get(transaction) ?? new Map<Y.Text, RecordedEdit>();
    edits.set(transaction, recorded);
    recorded.delete(text);
    after = checkpoint(doc);
    if (normalized) recorded.set(text, { after, delta: normalized });
  });
  return after!;
}

function equalAttribute(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key =>
    Object.hasOwn(right, key) && Reflect.get(left, key) === Reflect.get(right, key));
}
function equalAttributes(left: Record<string, unknown> | undefined, right: Record<string, unknown> | undefined) {
  const keys = Object.keys(left ?? {});
  return keys.length === Object.keys(right ?? {}).length &&
    keys.every(key => Object.hasOwn(right ?? {}, key) && equalAttribute(left![key], right?.[key]));
}

/** Normalize no-op formatting and adjacent operations using only the affected old ranges. */
function normalizeDelta(text: Y.Text, delta: WordDelta): Delta | undefined {
  const result: Delta = [];
  const before = wordTextIndex(text);
  const append = (part: Delta[number]) => {
    const last = result.at(-1);
    if (last?.retain !== undefined && part.retain !== undefined && equalAttributes(last.attributes, part.attributes)) last.retain += part.retain;
    else if (last?.delete !== undefined && part.delete !== undefined) last.delete += part.delete;
    else if (typeof last?.insert === 'string' && typeof part.insert === 'string' && equalAttributes(last.attributes, part.attributes)) last.insert += part.insert;
    else result.push(part);
  };
  let offset = 0;
  for (const part of delta) {
    if ([part.insert, part.retain, part.delete].filter(value => value !== undefined).length !== 1) return undefined;
    const count = part.retain ?? part.delete;
    if (count !== undefined && (!Number.isSafeInteger(count) || count < 0 || offset + count > text.length)) return undefined;
    if (part.insert !== undefined) {
      if (typeof part.insert !== 'string') return undefined;
      if (!part.insert) continue;
      const attributes = Object.fromEntries(Object.entries(part.attributes ?? {}).filter(([, value]) => value !== null));
      if (Object.values(attributes).some(value => value === undefined)) return undefined;
      append({ insert: part.insert, ...(Object.keys(attributes).length ? { attributes } : {}) });
    } else if (part.retain) {
      if (part.attributes) {
        for (const run of before.range(offset, offset + part.retain)) {
          const attributes = Object.fromEntries(Object.entries(part.attributes).filter(([key, value]) =>
            !equalAttribute(run.attributes?.[key] ?? null, value)));
          if (Object.values(attributes).some(value => value === undefined)) return undefined;
          append({ retain: run.insert.length, ...(Object.keys(attributes).length ? { attributes } : {}) });
        }
      } else append({ retain: part.retain });
      offset += part.retain;
    } else if (part.delete) {
      append({ delete: part.delete });
      offset += part.delete;
    }
  }
  while (result.at(-1)?.retain !== undefined && !result.at(-1)?.attributes) result.pop();
  return result;
}
