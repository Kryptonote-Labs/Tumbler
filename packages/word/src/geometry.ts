import { wordSectionColumns } from './section-columns.ts';
import type { WordBlock, WordSectionProperties, WordTable } from './document.ts';

/** Physical dimensions from the same section and table grid used by layout, in points. */
export function wordGeometryAt(blocks: readonly WordBlock[], finalSection: WordSectionProperties, paragraphId: number, tableDepth = 0) {
  const contains = (block: WordBlock): boolean => block.kind === 'paragraph' ? block.elementId === paragraphId : block.kind === 'table' && block.rows.some(row => row.cells.some(cell => cell.blocks.some(contains)));
  const index = blocks.findIndex(contains);
  if (index < 0) throw new Error('Document location unavailable.');
  const section = blocks.slice(index).find((block): block is Extract<WordBlock, { kind: 'paragraph' }> => block.kind === 'paragraph' && block.section !== undefined)?.section ?? finalSection;
  const pageWidthPoints = section.pageWidthTwips / 20;
  const bodyWidthPoints = Math.max(1, (section.pageWidthTwips - section.marginLeftTwips - section.marginRightTwips - section.gutterTwips) / 20);
  const columnWidths = wordSectionColumns(section).map(column => column.width);
  const columnWidthPoints = Math.min(...columnWidths);
  const page = { pageWidthPoints, pageHeightPoints: section.pageHeightTwips / 20, marginLeftPoints: section.marginLeftTwips / 20, marginRightPoints: section.marginRightTwips / 20, gutterPoints: section.gutterTwips / 20, bodyWidthPoints, columnCount: columnWidths.length, columnWidthPoints, columnWidthsPoints: columnWidths };
  const metrics = (table: WordTable, containerWidth: number) => {
    const availableWidthPoints = Math.max(1, containerWidth - table.properties.indentTwips / 20);
    const columnWidthsPoints = table.gridColumnWidthsTwips.map(width => width / 20);
    const widthPoints = columnWidthsPoints.length ? columnWidthsPoints.reduce((a, b) => a + b, 0) : availableWidthPoints;
    return { availableWidthPoints, widthPoints, widthCm: widthPoints * 2.54 / 72, columnWidthsPoints, fitsAvailableWidth: widthPoints <= availableWidthPoints + 0.05 };
  };
  let block = blocks[index]!;
  let available = columnWidthPoints;
  let depth = 0;
  while (block.kind === 'table') {
    const dimensions = metrics(block, available);
    if (depth++ === tableDepth) return { ...page, ...dimensions };
    let nested: WordBlock | undefined;
    for (const row of block.rows) {
      let column = row.gridBefore;
      for (const cell of row.cells) {
        const child = cell.blocks.find(contains);
        if (child) {
          const margins = cell.margins ?? block.properties.cellMargins;
          available = Math.max(1, dimensions.columnWidthsPoints.slice(column, column + cell.gridSpan).reduce((a, b) => a + b, 0) - (margins.startTwips + margins.endTwips) / 20);
          nested = child;
          break;
        }
        column += cell.gridSpan;
      }
      if (nested) break;
    }
    if (!nested) break;
    block = nested;
  }
  return { ...page, availableWidthPoints: available };
}
