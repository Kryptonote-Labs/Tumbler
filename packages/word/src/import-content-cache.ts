import type { WordArtifact } from './artifact.ts';
import type { WordContentBlock } from './create-content.ts';

const contents = new WeakMap<WordArtifact, WordContentBlock[]>();

/** Compiled native revisions already own the resolved authoring projection. */
export function rememberImportedWordContent(artifact: WordArtifact, blocks: WordContentBlock[]) {
  contents.set(artifact, blocks);
}

export function restoredWordContent(artifact: WordArtifact) {
  const cached = contents.get(artifact);
  // Import callers own their result; edits must not mutate the immutable native baseline.
  return cached && structuredClone(cached);
}
