import type { WordSectionProperties } from './document.ts';
import type { WordLayoutPage } from './layout.ts';

/** Physical column positions shared by pagination, headless geometry and renderers. */
export function wordSectionColumns(section: WordSectionProperties) {
  const left = (section.marginLeftTwips + section.gutterTwips) / 20;
  const available = Math.max(1, section.pageWidthTwips / 20 - left - section.marginRightTwips / 20);
  const definitions = section.columns?.length ? section.columns : Array.from({ length: section.columnCount }, () => ({
    widthTwips: Math.max(20, (available * 20 - section.columnSpaceTwips * (section.columnCount - 1)) / section.columnCount),
    spaceTwips: section.columnSpaceTwips,
  }));
  let x = left;
  return definitions.map(column => {
    const value = { x, width: column.widthTwips / 20, gap: column.spaceTwips / 20 };
    x += value.width + value.gap;
    return value;
  });
}

export function sameWordColumns(left: WordSectionProperties, right: WordSectionProperties) {
  return JSON.stringify(wordSectionColumns(left)) === JSON.stringify(wordSectionColumns(right));
}

export function wordColumnSeparators(page: WordLayoutPage) {
  return page.columns.flatMap((column, index) => {
    const next = page.columns[index + 1];
    if (!(column.section ?? page.section).columnSeparator || !next || next.y !== column.y || next.x <= column.x || next.section !== column.section) return [];
    return [{ x: (column.x + column.width + next.x) / 2, y: column.y, height: column.height }];
  });
}
