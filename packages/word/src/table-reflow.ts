import type { WordParagraph, WordTable } from './document.ts';
import type { PreparedParagraph, PreparedTable, PreparedTableCell } from './layout.ts';
import { preparedBlockHeight } from './table-pagination.ts';

/** Rewrap only the unplaced cell content, retaining source offsets across columns. */
export function reflowPreparedTable(
  fragment: PreparedTable,
  geometry: PreparedTable,
  paragraph: (source: WordParagraph, width: number, offset: number) => PreparedParagraph,
  table: (source: WordTable, width: number) => PreparedTable,
): PreparedTable {
  const originals = new Map(geometry.cells.map(cell => [cell.resolved.source, cell]));
  const cells = fragment.cells.map(cell => {
    const fresh = originals.get(cell.resolved.source)!;
    const width = Math.max(1, fresh.width - fresh.margins.start - fresh.margins.end);
    const blocks = cell.blocks.map(block => {
      if (!('paragraph' in block)) return reflowPreparedTable(block, table(block.table, width), paragraph, table);
      const offset = block.lines[0]?.startOffset ?? 0;
      const rewrapped = paragraph(block.paragraph, width, offset);
      return { ...rewrapped, marker: block.marker, ...(block.spacingBeforeAtStartTwips === undefined ? {} : { spacingBeforeAtStartTwips: block.spacingBeforeAtStartTwips }),
        format: { ...rewrapped.format, spacingBeforeTwips: block.format.spacingBeforeTwips, spacingAfterTwips: block.format.spacingAfterTwips } };
    });
    return { ...cell, width: fresh.width, margins: fresh.margins, blocks: Object.freeze(blocks),
      contentHeight: blocks.reduce((sum, block) => sum + preparedBlockHeight(block), 0) + fresh.margins.top + fresh.margins.bottom };
  });
  const rowHeights = fragment.sourceRows.map((source, index) => {
    const row = fragment.table.rows[source]!;
    return row.heightRule === 'auto' || row.heightTwips === undefined ? 0 : Math.min(fragment.rowHeights[index]!, row.heightTwips / 20);
  });
  for (const cell of cells) {
    const { row, rowSpan } = cell.resolved;
    const allocated = rowHeights.slice(row, row + rowSpan).reduce((sum, height) => sum + height, 0);
    if (allocated < cell.contentHeight) rowHeights[row + rowSpan - 1]! += cell.contentHeight - allocated;
  }
  const cellsByRow = rowHeights.map((): PreparedTableCell[] => []);
  for (const cell of cells) cellsByRow[cell.resolved.row]!.push(cell);
  return Object.freeze({ ...fragment, width: geometry.width, xOffset: geometry.xOffset, columnOffsets: geometry.columnOffsets,
    rowHeights: Object.freeze(rowHeights.map(height => Math.max(1, height))), cells: Object.freeze(cells),
    cellsByRow: Object.freeze(cellsByRow.map(row => Object.freeze(row))) });
}
