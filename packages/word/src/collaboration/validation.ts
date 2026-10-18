import { registerWordListLevel, type WordAuthoredList } from '../authored-list.ts';
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
  const lists = new Map<string, Map<number, WordAuthoredList>>();
  for (const part of text.toDelta()) {
    if (typeof part.insert !== 'string') throw new Error('Only text is supported.');
    validateAttributes(part.attributes);
    if (part.attributes?.breakType && (part.attributes.image || part.attributes.field || !/^\u2028+$/.test(part.insert))) throw new Error('Break formatting belongs on line-separator characters.');
    if (part.attributes?.ink && (part.attributes.shape || part.attributes.image || part.attributes.field || part.attributes.tab || part.attributes.breakType || !/^\uFFFC+$/.test(part.insert))) throw new Error('Ink attributes require object characters.');
    if (part.attributes?.shape && (part.attributes.image || part.attributes.field || !/^\uFFFC+$/.test(part.insert))) throw new Error('Shape attributes require object characters.');
    if (part.attributes?.field && (part.attributes.image || !/^\uFFFC+$/.test(part.insert))) throw new Error('Invalid page field content.');
    if (part.attributes?.tab && (part.attributes.field || part.attributes.image || !/^\t+$/.test(part.insert))) throw new Error('Invalid positional tab content.');
    if (part.attributes?.styleId && !/^\n+$/.test(part.insert)) throw new Error('Paragraph styles belong on paragraph boundaries.');
    if (part.attributes?.paragraph && !/^\n+$/.test(part.insert)) throw new Error('Paragraph formatting belongs on paragraph boundaries.');
    if (part.attributes?.positioning && !/^\n+$/.test(part.insert)) throw new Error('Paragraph positioning belongs on paragraph boundaries.');
    const list = part.attributes?.list;
    if (list) {
      const levels = lists.get(list.id) ?? new Map<number, WordAuthoredList>();
      registerWordListLevel(levels, list);
      lists.set(list.id, levels);
    }
  }
  validateText(text.toString());
  groupTableParagraphs(tableParagraphs(text));
  documentImageRefs(text);
}
