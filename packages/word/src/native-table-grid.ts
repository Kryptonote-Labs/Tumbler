import type { WordContentBlock } from './create-content.ts';
import type { WordTable, WordTableRow } from './document.ts';

/** Word ignores conflicting imported omission counts. Keep raw declarations for export,
 * while the native layout uses the same effective grid as resolveWordTableGrid.
 */
export function nativeTableRowGrids(
  table: Extract<WordContentBlock, { kind: 'table' }>,
  original: WordTable | undefined,
  rows: ReadonlyMap<number, WordTableRow> | undefined,
  columns: number,
) {
  return table.rowGrids?.map((grid, index) => {
    const source = rows?.get(table.rowSources?.[index]!);
    if (!original || !source || grid.before !== source.gridBefore || grid.after !== source.gridAfter)
      return grid;
    const before = grid.before > original.gridColumnWidthsTwips.length ? 0 : grid.before;
    const occupied = table.rows[index]!.reduce((sum, cell) => sum + (cell.gridSpan ?? 1), 0);
    return { before, after: Math.min(grid.after, Math.max(0, columns - before - occupied)) };
  });
}
