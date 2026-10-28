import { validateText } from './text-validation.ts';
export { validateText } from './text-validation.ts';
import { isSectionPropertyAttribute } from './section-attributes.ts';
import { isParagraphPropertyAttribute } from './paragraph-attributes.ts';
import { registerWordListLevel, type WordAuthoredList } from '../authored-list.ts';
import type * as Y from 'yjs';
import { validateAttributes } from './formatting.ts';
import { groupTableParagraphs, tableParagraphs } from './tables.ts';
import { validateStructuredTables } from './structured/state.ts';
import { documentImageRefs } from './images.ts';

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
    if ((part.attributes?.paragraph || Object.keys(part.attributes ?? {}).some(isParagraphPropertyAttribute)) && !/^\n+$/.test(part.insert)) throw new Error('Paragraph formatting belongs on paragraph boundaries.');
    if (part.attributes?.positioning && !/^\n+$/.test(part.insert)) throw new Error('Paragraph positioning belongs on paragraph boundaries.');
    if ((part.attributes?.wordSection || Object.keys(part.attributes ?? {}).some(isSectionPropertyAttribute)) && (!/^\n+$/.test(part.insert) || part.attributes?.table)) throw new Error('Section boundaries belong on body paragraph marks.');
    const list = part.attributes?.list;
    if (list) {
      const levels = lists.get(list.id) ?? new Map<number, WordAuthoredList>();
      registerWordListLevel(levels, list);
      lists.set(list.id, levels);
    }
  }
  validateText(text.toString());
  groupTableParagraphs(tableParagraphs(text), { retainedBaseline: true });
  if (text.doc) validateStructuredTables(text.doc);
  documentImageRefs(text);
}
