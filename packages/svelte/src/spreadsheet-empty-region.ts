import type { SpreadsheetWorksheet } from '@tumblerjs/sheets';

/** Find the untouched area below authored rows and beyond any styled columns. */
export function spreadsheetEmptyRegionStart(worksheet: SpreadsheetWorksheet) {
  const style = worksheet.styles.resolve(0);
  if (style.fill.patternType === 'solid' || Object.values(style.border).some(edge => edge?.style !== undefined)) return undefined;
  let row = worksheet.dimension?.end.row ?? 0;
  let column = 0;
  for (const item of worksheet.rows) {
    row = Math.max(row, item.index);
  }
  for (const item of worksheet.columns) if (item.styleIndex !== undefined) column = Math.max(column, item.max);
  const ranges = [
    ...worksheet.merges,
    ...worksheet.tables.map(table => table.range),
    ...worksheet.hyperlinks.map(link => link.range),
    ...worksheet.conditionalFormatting.flatMap(format => format.ranges),
  ];
  for (const range of ranges) {
    row = Math.max(row, range.end.row);
  }
  return { row, column };
}
