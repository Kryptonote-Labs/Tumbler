import type { WordArtifact } from './artifact.ts';
import type { WordContentBlock } from './create-content.ts';
import type { WordTextParagraph } from './create.ts';
import { importWordContent } from './import-content.ts';

/** Added shared styles can change inherited lists before a later story is reconciled.
 * Keep an unchanged list's original edit intent instead of emitting a cancellation.
 */
export function refreshUnchangedNumbering(original: WordArtifact, current: WordArtifact, blocks: readonly WordContentBlock[]): readonly WordContentBlock[] {
  if (original.document.styles.styles.length === current.document.styles.styles.length) return blocks;
  const lists = (artifact: WordArtifact) => {
    const result = new Map<number, WordTextParagraph['list']>();
    const visit = (items: readonly WordContentBlock[]) => {
      for (const item of items) {
        if (item.kind === 'paragraph' && item.source !== undefined) result.set(item.source, item.list);
        else if (item.kind === 'table') for (const row of item.rows) for (const cell of row) visit(cell.blocks);
      }
    };
    visit(importWordContent(artifact));
    return result;
  };
  const before = lists(original);
  const after = lists(current);
  const visit = (items: readonly WordContentBlock[]): WordContentBlock[] => items.map(item => {
    if (item.kind === 'table') return { ...item, rows: item.rows.map(row => row.map(cell => ({ ...cell, blocks: visit(cell.blocks) }))) };
    if (item.kind !== 'paragraph' || item.source === undefined || !before.has(item.source) || !after.has(item.source) ||
        JSON.stringify(item.list) !== JSON.stringify(before.get(item.source))) return item;
    const list = after.get(item.source);
    if (JSON.stringify(list) === JSON.stringify(item.list)) return item;
    const { list: _old, ...paragraph } = item;
    return { ...paragraph, ...(list === undefined ? {} : { list }) };
  });
  return visit(blocks);
}
