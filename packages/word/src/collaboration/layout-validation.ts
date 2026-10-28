import { wordLayoutSource } from './layout-source.ts';
export { bindWordLayoutSource, inheritWordLayoutSource, wordLayoutSource } from './layout-source.ts';
import { validateWordSectionReferences } from '../section-format.ts';
import type * as Y from 'yjs';
import { inspectWordSections } from '../operations/layout.ts';
import { wordSharedText } from './structured/view.ts';
import { readWordDocumentSettings } from './document-settings.ts';

/** Invalid combinations are rejected on the staged replica, including two prepared margin edits. */
export function validateWordLayout(doc: Y.Doc) {
  const settings = readWordDocumentSettings(doc);
  const source = wordLayoutSource(doc);
  if (!settings.finalSection) {
    const parts: { attributes?: Record<string, unknown> }[] = doc.getText('body').toDelta();
    const authored = parts.some(part => Object.entries(part.attributes ?? {}).some(([key, value]) =>
      key.startsWith('wordSectionFormat:') || key === 'wordSection' && !!value && typeof value === 'object' && 'format' in value && !!value.format && typeof value.format === 'object' && Object.keys(value.format).length > 0));
    if (!authored) return;
  }
  const sections = inspectWordSections(wordSharedText(doc.getText('body')).text, source);
  const known = source ? [...source.sections.map(section => section.properties), source.finalSection] : [];
  for (const section of sections) validateWordSectionReferences(section.properties, known);
}
