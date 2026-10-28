import type { WordArtifact } from './artifact.ts';
import type { WordSectionProperties } from './document.ts';

/** Immutable import geometry, suitable for hosts that validate updates without reopening DOCX bytes. */
export interface WordSectionBaseline {
  readonly finalSection: WordSectionProperties;
  readonly sections: readonly { readonly paragraph: number; readonly properties: WordSectionProperties }[];
}
const baselines = new WeakMap<WordArtifact, WordSectionBaseline>();
export function wordSectionBaseline(source: WordArtifact): WordSectionBaseline {
  const found = baselines.get(source);
  if (found) return found;
  const baseline = { finalSection: source.document.finalSection, sections: source.document.blocks.flatMap(block =>
    block.kind === 'paragraph' && block.section ? [{ paragraph: block.elementId, properties: block.section }] : []) };
  baselines.set(source, baseline);
  return baseline;
}
