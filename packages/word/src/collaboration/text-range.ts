import { wordTextIndex } from './text-index.ts';
import type * as Y from 'yjs';
import { validateAttributes } from './formatting.ts';
import { validateText } from './validation.ts';

export interface WordTextRangePart {
  insert: string;
  attributes?: Record<string, unknown>;
}

/** Read a UTF-16 range from the incremental index, with fresh reads during unfinished writes.
 * The returned parts and attribute objects are copies. The document must contain text only.
 */
export function wordTextRange(text: Y.Text, start = 0, end = text.length): WordTextRangePart[] {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start)
    throw new Error('Invalid text range.');
  return wordTextIndex(text).range(start, end).map(part => ({
    insert: part.insert,
    ...(part.attributes && Object.keys(part.attributes).length ? { attributes: { ...part.attributes } } : {}),
  }));
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

const visualAttributes = new Set([
  'bold', 'italic', 'underline', 'strike', 'fontFamily', 'wordUnderline', 'highlight',
  'shading', 'verticalAlign', 'characterSpacingPoints', 'link', 'color', 'font', 'fontSize',
]);

/** Prove that a delta on an already validated region preserves its structural invariants.
 * Read deletions from an untouched replica of the pre-edit text. False requires full validation.
 * Hosts must still check source references, custom attributes, metadata and update completeness.
 * With allowFormatting, validate host-specific values in retain patches as well as insertions.
 */
export function isWordTextOnlyEdit(delta: Y.YTextEvent['delta'], previous: Y.Text, allowFormatting = false): boolean {
  let offset = 0;
  for (const part of delta) {
    if (part.retain) {
      if (part.attributes) {
        if (!allowFormatting || Object.keys(part.attributes).some(key => !visualAttributes.has(key))) return false;
        validateAttributes(Object.fromEntries(Object.entries(part.attributes).filter(([, value]) => value !== null)));
      }
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
