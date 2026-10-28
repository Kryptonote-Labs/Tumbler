import * as Y from 'yjs';
import { tableParagraphs, isTableCell } from './tables.ts';
import type { WordSourceTextPart } from './source-text.ts';

/** An existing table baseline owns its historical payload ranges. A display repair must
 * not silently absorb a preceding paragraph that its deletion witnesses never covered.
 */
export function retainSourceTableBoundaries(
  text: Y.Text,
  parts: readonly WordSourceTextPart[],
  paragraphs: readonly { start: number; end: number; attributes?: Record<string, unknown> }[],
) {
  const doc = text.doc!;
  if (!paragraphs.some(paragraph => isTableCell(paragraph.attributes?.table))) return parts;
  const story = Y.createRelativePositionFromTypeIndex(text, 0).tname;
  if (story === null) return parts;
  const raw = tableParagraphs(text);
  const retained: { start: number; end: number }[] = [];
  for (const paragraph of paragraphs) {
    const table = paragraph.attributes?.table;
    if (!isTableCell(table)) continue;
    for (const owner of [...(table.parents ?? []), table]) {
      const name = 'word-table-v2:' + JSON.stringify([story, owner.id]);
      if (!doc.share.has(name)) continue;
      const bases = [...doc.getMap<unknown>(name).values()].filter(
        (value) =>
          value !== null && typeof value === 'object' && 'kind' in value && value.kind === 'base',
      );
      if (bases.length !== 1 || Reflect.get(bases[0]!, 'sourceText') === true) continue;
      const first = raw.find(
        (p) =>
          (p.table?.id === owner.id && p.table.cell === owner.cell) ||
          p.table?.parents?.some((parent) => parent.id === owner.id && parent.cell === owner.cell),
      );
      if (first && first.start > paragraph.start)
        retained.push({ start: paragraph.start, end: first.start });
    }
  }
  if (!retained.length) return parts;
  return parts.flatMap((part) => {
    if (
      !part.normalized ||
      !part.raw?.includes('\n') ||
      !retained.some((range) => part.offset >= range.start && part.end <= range.end)
    )
      return [part];
    return [...part.raw].map((value, index) => ({
      ...part,
      insert: value === '\n' ? '\n' : part.insert,
      offset: part.offset + index,
      end: part.offset + index + 1,
    }));
  });
}
