import type * as Y from 'yjs';
import type { WordArtifact } from '../artifact.ts';
import { wordSectionBaseline, type WordSectionBaseline } from '../section-baseline.ts';

const sources = new WeakMap<Y.Doc, WordSectionBaseline>();
/** Prepared edits are valid only for the baseline against which they were checked. */
export function wordLayoutSource(doc: Y.Doc) {
  return sources.get(doc);
}
export function bindWordLayoutSource(doc: Y.Doc, source: WordArtifact | WordSectionBaseline) {
  sources.set(doc, 'document' in source ? wordSectionBaseline(source) : source);
}
export function inheritWordLayoutSource(original: Y.Doc, candidate: Y.Doc) {
  const source = sources.get(original);
  if (source) sources.set(candidate, source);
}
