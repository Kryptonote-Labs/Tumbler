import * as Y from 'yjs';
import type { WordDelta } from './commands.ts';
import { wordTextIndex } from './text-index.ts';

/** A mutation inside one formatted string needs no formatting seek or gap repair.
 * Use Yjs's exported item integration so identifiers, updates, undo and remote merges
 * follow the same CRDT rules. Cross-format edits use Y.Text's general implementation.
 */
export function editWordTextItem(text: Y.Text, delta: WordDelta, transaction: Y.Transaction): boolean {
  if (text._searchMarker !== null) return false;
  const leading = delta[0]?.retain !== undefined && !delta[0].attributes;
  if (delta.length !== (leading ? 2 : 1)) return false;
  const at = leading ? delta[0]!.retain! : 0;
  const change = delta[leading ? 1 : 0]!;
  if ([change.insert, change.delete, change.retain].filter(value => value !== undefined).length !== 1) return false;
  if (!Number.isSafeInteger(at) || at < 0 || at > text.length ||
    change.delete !== undefined && (!Number.isSafeInteger(change.delete) || change.delete <= 0)) return false;
  if (change.retain !== undefined || change.attributes && change.insert === undefined) return false;
  const id = Y.createRelativePositionFromTypeIndex(text, at).item;
  if (!id) return false;
  const item = Y.getItem(transaction.doc.store, id);
  if (!(item instanceof Y.Item) || item.deleted || item.parent !== text || !(item.content instanceof Y.ContentString)) return false;
  const offset = id.clock - item.id.clock;
  const visible = (item: Y.Item | null, side: 'left' | 'right') => {
    while (item?.deleted) item = item[side];
    return item;
  };
  if (!offset && !(visible(item.left, 'left')?.content instanceof Y.ContentString)) return false;
  if (typeof change.insert === 'string' && change.insert.length) {
    const current = wordTextIndex(text).range(at, at + 1)[0]?.attributes ?? {};
    const attributes = Object.fromEntries(Object.entries(change.attributes ?? {}).filter(([, value]) => value !== null));
    const keys = Object.keys(current);
    if (keys.length !== Object.keys(attributes).length || keys.some(key => current[key] !== attributes[key])) return false;
    const right = Y.getItemCleanStart(transaction, id), left = right.left;
    const doc = transaction.doc;
    new Y.Item(Y.createID(doc.clientID, Y.getState(doc.store, doc.clientID)),
      left, left?.lastId ?? null, right, right.id, text, null,
      new Y.ContentString(change.insert)).integrate(transaction, 0);
    return true;
  }
  if (change.delete && offset + change.delete <= item.length) {
    if (offset + change.delete === item.length && !(visible(item.right, 'right')?.content instanceof Y.ContentString)) return false;
    if (offset + change.delete < item.length)
      Y.getItemCleanStart(transaction, Y.createID(id.client, id.clock + change.delete));
    Y.getItemCleanStart(transaction, id).delete(transaction);
    return true;
  }
  return false;
}
