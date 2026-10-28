import * as Y from 'yjs';
import type { WordDelta } from '../commands.ts';
import { isWordTextOnlyEdit } from '../text-range.ts';
import { wordTextString } from '../text-index.ts';
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
  const value = wordTextString(text);
  const boundary = (at: number) => at === 0 || at === value.length ||
    !(value.charCodeAt(at - 1) >= 0xd800 && value.charCodeAt(at - 1) <= 0xdbff &&
      value.charCodeAt(at) >= 0xdc00 && value.charCodeAt(at) <= 0xdfff);
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
    // Y.Text fills omitted formatting keys into a supplied delta. Keep the caller's
    // operation unchanged, including when its attributes are shared with another edit.
    text.applyDelta(delta.map(part => ({ ...part,
      ...(part.attributes ? { attributes: { ...part.attributes } } : {}),
    })));
    validated.set(doc, checkpoint(doc));
  }, origin);
  return true;
}
