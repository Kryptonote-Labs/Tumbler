import { applyTrackedWordDelta } from '../text-events.ts';
import * as Y from 'yjs';
import type { WordDelta } from '../commands.ts';
import { isWordTextOnlyEdit, wordTextRange } from '../text-range.ts';
import { checkpoint, matchesCheckpoint, validatedCheckpoint } from './preparation-cache.ts';
import { legacyTables } from './legacy-tables.ts';
import { validateWordSharedDocument } from './transactions.ts';

const validated = new WeakMap<Y.Doc, ReturnType<typeof checkpoint>>();

/** A valid document plus a fully checked inline delta remains valid without a staging replica.
 * Capture the resulting checkpoint before observers run: an observer's unrelated writes must
 * never become a trusted baseline. Structural changes and received updates still use staging.
 */
export function applyInlineWordDelta(doc: Y.Doc, story: string, delta: WordDelta, origin: unknown): boolean {
  if (delta.length > 3 || [...doc.share.keys()].some(name => name.startsWith('word-table-v2:'))) return false;
  const text = doc.getText(story);
  if (legacyTables(text).size) return false;
  let consumed = 0;
  const boundary = (at: number) => {
    if (at === 0 || at === text.length) return true;
    const pair = wordTextRange(text, at - 1, at + 1).map(part => part.insert).join('');
    return !(pair.charCodeAt(0) >= 0xd800 && pair.charCodeAt(0) <= 0xdbff &&
      pair.charCodeAt(1) >= 0xdc00 && pair.charCodeAt(1) <= 0xdfff);
  };
  for (const part of delta) {
    if (Object.keys(part).some(key => !['retain', 'delete', 'insert', 'attributes'].includes(key)) ||
      [part.retain, part.delete, part.insert].filter(item => item !== undefined).length !== 1) return false;
    if (part.retain !== undefined || part.delete !== undefined) {
      const count = part.retain ?? part.delete!;
      if (!Number.isSafeInteger(count) || count < 0 || consumed + count > text.length) return false;
      consumed += count;
    }
    if (!boundary(consumed)) return false;
  }
  if (!isWordTextOnlyEdit(delta, text, true)) return false;
  const prior = validated.get(doc) ?? validatedCheckpoint(doc);
  if (!prior || !matchesCheckpoint(doc, prior)) validateWordSharedDocument(doc);
  doc.transact(() => {
    validated.set(doc, applyTrackedWordDelta(text, delta));
  }, origin);
  return true;
}
