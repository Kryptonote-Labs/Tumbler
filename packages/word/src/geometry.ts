import { wordSectionColumns } from './section-columns.ts';
import type { WordBlock, WordSectionProperties, WordTable } from './document.ts';
import type { WordLayout, WordLayoutTable } from './layout.ts';

/** Resolve a table's actual container, including unequal columns and nested story tables. */
export function wordTableAvailableWidth(
  layout: WordLayout,
  blocks: readonly WordBlock[],
  tableElementId: number,
  story?: 'header' | 'footer',
  pageIndex = 0,
): number | undefined {
  const sources = new Map<number, WordTable>();
  const collect = (items: readonly WordBlock[]) => {
    for (const block of items) {
      if (block.kind !== 'table') continue;
      sources.set(block.elementId, block);
      for (const row of block.rows) for (const cell of row.cells) collect(cell.blocks);
    }
  };
  collect(blocks);
  function find(tables: readonly WordLayoutTable[], width: number): number | undefined {
    for (const table of tables) {
      const source = sources.get(table.tableElementId);
      if (!source) continue;
      if (table.tableElementId === tableElementId)
        return Math.max(1, width - (source.properties.alignment === 'center' || source.properties.alignment === 'end' ? 0 : source.properties.indentTwips / 20));
      for (const cell of table.cells) {
        const original = source.rows.flatMap(row => row.cells).find(item => item.elementId === cell.cellElementId);
        if (!original) continue;
        const margins = original.margins ?? source.properties.cellMargins;
        const found = find(cell.tables, Math.max(1, cell.width - (margins.startTwips + margins.endTwips) / 20));
        if (found !== undefined) return found;
      }
    }
  }
  for (const page of layout.pages) {
    if (story) {
      if (page.index !== pageIndex) continue;
      const width = (page.section.pageWidthTwips - page.section.marginLeftTwips - page.section.marginRightTwips - page.section.gutterTwips) / 20;
      return find(story === 'header' ? page.headerTables : page.footerTables, width);
    }
    for (const column of page.columns) {
      const found = find(column.tables, column.width);
      if (found !== undefined) return found;
    }
  }
}

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
