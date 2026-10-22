import * as Y from 'yjs';
import { validateAttributes } from './formatting.ts';
import { validateText } from './validation.ts';

export interface WordTextRangePart {
  insert: string;
  attributes?: Record<string, unknown>;
}

/** Read a UTF-16 range without materializing unchanged text. Walks CRDT items, not characters.
 * The returned parts and attribute objects are copies. The document must contain text only.
 */
export function wordTextRange(text: Y.Text, start = 0, end = text.length): WordTextRangePart[] {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start)
    throw new Error('Invalid text range.');
  const result: WordTextRangePart[] = [];
  const attributes: Record<string, unknown> = {};
  let offset = 0;
  // Y.Text exposes its linked items; inspecting ContentString avoids getContent(),
  // which splits an entire unchanged string into individual characters.
  for (let item = text._start; item && offset < end; item = item.right) {
    if (item.deleted) continue;
    const content = item.content;
    if (content instanceof Y.ContentFormat) {
      if (content.value === null) delete attributes[content.key];
      else attributes[content.key] = content.value;
    } else if (item.countable) {
      const from = Math.max(0, start - offset);
      const to = Math.min(item.length, end - offset);
      if (to > from) {
        if (!(content instanceof Y.ContentString)) throw new Error('Only text is supported.');
        result.push({
          insert: content.str.slice(from, to),
          ...(Object.keys(attributes).length ? { attributes: { ...attributes } } : {}),
        });
      }
      offset += item.length;
    }
  }
  return result;
}

const inlineAttributes = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'wordSource',
  'wordParagraph',
  'wordCopy',
  'fontFamily',
  'wordUnderline',
  'align',
  'highlight',
  'shading',
  'verticalAlign',
  'characterSpacingPoints',
  'link',
  'color',
  'font',
  'fontSize',
]);

/** Prove that a delta on an already validated region preserves its structural invariants.
 * Read deletions from an untouched replica of the pre-edit text. False requires full validation.
 * Hosts must still check source references, custom attributes, metadata and update completeness.
 */
export function isWordTextOnlyEdit(delta: Y.YTextEvent['delta'], previous: Y.Text): boolean {
  let offset = 0;
  for (const part of delta) {
    if (part.retain) {
      if (part.attributes) return false;
      offset += part.retain;
    }
    if (part.delete) {
      const removed = wordTextRange(previous, offset, offset + part.delete)
        .map((run) => run.insert)
        .join('');
      if (/[\n\uFFFC]/.test(removed) || !removed.isWellFormed()) return false;
      offset += part.delete;
    }
    if (part.insert !== undefined) {
      if (typeof part.insert !== 'string' || /[\n\uFFFC]/.test(part.insert)) return false;
      if (Object.keys(part.attributes ?? {}).some((key) => !inlineAttributes.has(key)))
        return false;
      validateText(part.insert);
      validateAttributes(part.attributes);
    }
  }
  return true;
}
