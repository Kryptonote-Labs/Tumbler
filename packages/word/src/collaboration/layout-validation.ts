import type * as Y from 'yjs';
import type { WordArtifact } from '../artifact.ts';
import { wordSectionBaseline, type WordSectionBaseline } from '../section-baseline.ts';
import { inspectWordSections } from '../operations/layout.ts';
import { wordSharedText } from './structured/view.ts';
import { readWordDocumentSettings } from './document-settings.ts';

const sources = new WeakMap<Y.Doc, WordSectionBaseline>();
export function bindWordLayoutSource(doc: Y.Doc, source: WordArtifact | WordSectionBaseline) {
  sources.set(doc, 'document' in source ? wordSectionBaseline(source) : source);
}
export function inheritWordLayoutSource(original: Y.Doc, candidate: Y.Doc) {
  const source = sources.get(original);
  if (source) sources.set(candidate, source);
}
/** Invalid combinations are rejected on the staged replica, including two prepared margin edits. */
export function validateWordLayout(doc: Y.Doc) {
  const settings = readWordDocumentSettings(doc);
  const source = sources.get(doc);
  if (!settings.finalSection) {
    const parts: { attributes?: Record<string, unknown> }[] = doc.getText('body').toDelta();
    const authored = parts.some(part => Object.entries(part.attributes ?? {}).some(([key, value]) =>
      key.startsWith('wordSectionFormat:') || key === 'wordSection' && !!value && typeof value === 'object' && 'format' in value && !!value.format && typeof value.format === 'object' && Object.keys(value.format).length > 0));
    if (!authored) return;
  }
  inspectWordSections(wordSharedText(doc.getText('body')).text, source);
}
