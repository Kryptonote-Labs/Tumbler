import { beginPackageTransaction } from '@tumblerjs/opc';
import { openWordArtifact, type WordArtifact } from './artifact.ts';
import { prepareWordContent, reconcileWordContent } from './content-export.ts';
import type { WordContentBlock } from './create-content.ts';
import { storyMainArtifact, wordStoryArtifact } from './stories.ts';

/** Existing stories can share one commit when they do not alter global resources. */
export function reconcileWordStories(
  source: WordArtifact,
  updates: readonly { partName: string; blocks: readonly WordContentBlock[] }[],
): WordArtifact {
  if (!updates.length) return source;
  const transaction = beginPackageTransaction(source.document.package);
  const seen = new Set<string>();
  for (const update of updates) {
    if (seen.has(update.partName) || !prepareWordContent(wordStoryArtifact(source, update.partName), update.blocks, transaction)) {
      // Discard all staged changes; every edit below sees its predecessor's resources.
      transaction.rollback();
      return updates.reduce((current, next) => storyMainArtifact(reconcileWordContent(
        wordStoryArtifact(current, next.partName), next.blocks,
      )), source);
    }
    seen.add(update.partName);
  }
  return openWordArtifact(transaction.commit(), {
    maxBlocks: Number.MAX_SAFE_INTEGER,
    maxInlineItems: Number.MAX_SAFE_INTEGER,
    maxTextCharacters: Number.MAX_SAFE_INTEGER,
  });
}
