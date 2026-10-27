import type { WordArtifact } from './artifact.ts';
import type { WordContentBlock } from './create-content.ts';
import type { WordTextParagraph } from './create.ts';
import { importWordContent } from './import-content.ts';

/** Shared styles can change effective formatting before a later story is exported.
 * Refresh unchanged imported values so export retains the original direct declarations.
 */
export function refreshUnchangedFormatting(original: WordArtifact, current: WordArtifact, blocks: readonly WordContentBlock[]): readonly WordContentBlock[] {
  if (original.document.styles.styles.length === current.document.styles.styles.length) return blocks;
  const paragraphs = (artifact: WordArtifact) => {
    const result = new Map<number, WordTextParagraph>();
    const visit = (items: readonly WordContentBlock[]) => {
      for (const item of items) {
        if (item.kind === 'paragraph' && item.source !== undefined) result.set(item.source, item);
        else if (item.kind === 'table') for (const row of item.rows) for (const cell of row) visit(cell.blocks);
      }
    };
    visit(importWordContent(artifact));
    return result;
  };
  const before = paragraphs(original);
  const after = paragraphs(current);
  const visit = (items: readonly WordContentBlock[]): WordContentBlock[] => items.map(item => {
    if (item.kind === 'table') return { ...item, rows: item.rows.map(row => row.map(cell => ({ ...cell, blocks: visit(cell.blocks) }))) };
    if (item.kind !== 'paragraph' || item.source === undefined) return item;
    const previous = before.get(item.source), next = after.get(item.source);
    if (!previous || !next) return item;
    const unchangedList = JSON.stringify(item.list) === JSON.stringify(previous.list);
    const unchangedPositioning = JSON.stringify(item.positioning) === JSON.stringify(previous.positioning);
    const { list, positioning, ...paragraph } = item;
    const refreshedList = unchangedList ? next.list : list;
    const refreshedPositioning = unchangedPositioning ? next.positioning : positioning;
    return { ...paragraph, ...(refreshedList === undefined ? {} : { list: refreshedList }), ...(refreshedPositioning === undefined ? {} : { positioning: refreshedPositioning }) };
  });
  return visit(blocks);
}
