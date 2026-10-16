import { beginPackageTransaction } from '@tumblerjs/opc';
import { openWordArtifact, type WordArtifact } from './artifact.ts';
import { prepareWordContent, reconcileWordContent } from './content-export.ts';
import type { WordBlock } from './document.ts';
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

/** Append body resources first, then independent story edits, without reopening between them. */
export function reconcileWordContentAndStories(
  source: WordArtifact,
  blocks: readonly WordContentBlock[],
  updates: readonly { partName: string; blocks: readonly WordContentBlock[] }[],
): WordArtifact {
  if (!updates.length) return reconcileWordContent(source, blocks);
  const transaction = beginPackageTransaction(source.document.package);
  const fallback = () => {
    transaction.rollback();
    return reconcileWordStories(reconcileWordContent(source, blocks), updates);
  };
  if (!prepareWordContent(source, blocks, transaction, 'body')) return fallback();
  const seen = new Set<string>([source.document.part.name.value]);
  for (const update of updates) {
    if (seen.has(update.partName)) return fallback();
    const story = wordStoryArtifact(source, update.partName);
    // Appended body definitions could give a previously dangling story reference a meaning.
    if (hasUnresolvedNumbering(story) || !prepareWordContent(story, update.blocks, transaction))
      return fallback();
    seen.add(update.partName);
  }
  return openWordArtifact(transaction.commit(), {
    maxBlocks: Number.MAX_SAFE_INTEGER,
    maxInlineItems: Number.MAX_SAFE_INTEGER,
    maxTextCharacters: Number.MAX_SAFE_INTEGER,
  });
}

function hasUnresolvedNumbering(artifact: WordArtifact): boolean {
  const document = artifact.document;
  const numbering = document.numbering;
  const instances = new Map(numbering.instances.map(item => [item.id, item]));
  const abstracts = new Map(numbering.abstracts.map(item => [item.id, item]));
  const visit = (blocks: readonly WordBlock[]): boolean => blocks.some(block => {
    if (block.kind === 'table') return block.rows.some(row => row.cells.some(cell => visit(cell.blocks)));
    if (block.kind !== 'paragraph') return false;
    const reference = numbering.paragraphReference(document, block);
    if (!reference) return false;
    const instance = instances.get(reference.numId);
    const definition = instance && abstracts.get(instance.abstractId);
    return !instance || !definition || !(instance.levelOverrides.get(reference.level) ?? definition.levels.find(level => level.level === reference.level));
  });
  return visit(document.blocks);
}
