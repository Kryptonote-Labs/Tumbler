import type * as Y from 'yjs';
import { validateAttributes } from './formatting.ts';
import { groupTableParagraphs, tableParagraphs } from './tables.ts';
import { documentImageRefs } from './images.ts';
export function validateText(text: string) {
  if (!text.isWellFormed()) throw new Error('This document contains an incomplete character.');
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(text))
    throw new Error('This document contains unsupported control characters.');
}

/** Structural invariants apply equally to local, remote and headless operations. */
export function validateWordText(text: Y.Text) {
  const lists = new Map<string, string>();
  for (const part of text.toDelta()) {
    if (typeof part.insert !== 'string') throw new Error('Only text is supported.');
    validateAttributes(part.attributes);
    if (part.attributes?.field && (part.attributes.image || !/^\uFFFC+$/.test(part.insert))) throw new Error('Invalid page field content.');
    const list = part.attributes?.list;
    if (list) {
      if (lists.has(list.id) && lists.get(list.id) !== list.kind) throw new Error('A list must use consistent numbering.');
      lists.set(list.id, list.kind);
    }
  }
  validateText(text.toString());
  groupTableParagraphs(tableParagraphs(text));
  documentImageRefs(text);
}
