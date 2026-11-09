import type { SpreadsheetArtifact } from './artifact.ts';
import type { CellRange } from './references.ts';
import { restyleSpreadsheetRange } from './sheet-restyle.ts';
import { openSpreadsheet, type SpreadsheetSheet, type SpreadsheetWorkbook } from './workbook.ts';
import { openWorksheet } from './worksheet.ts';
import { z } from 'zod';
const coordinate = z.number().int().nonnegative();
const region = z.object({ row: coordinate, column: coordinate, height: coordinate.positive(), width: coordinate.positive(), style: coordinate }).strict();
export const spreadsheetPainterSample = z.object({ height: coordinate.positive(), width: coordinate.positive(), style: coordinate, regions: z.array(region) }).strict().refine(s => s.regions.every(r => r.row + r.height <= s.height && r.column + r.width <= s.width), 'Style regions must fit inside the sampled range.');
export type SpreadsheetPainterSample = z.infer<typeof spreadsheetPainterSample>;
/** Capture defaults and explicit style overrides without materializing blank cells. */
export function spreadsheetFormatPainterSample(artifact: SpreadsheetArtifact, range: CellRange): SpreadsheetPainterSample {
  const sample: SpreadsheetPainterSample = { height: range.end.row - range.start.row + 1, width: range.end.column - range.start.column + 1, style: 0, regions: [] };
  const add = (r: number, c: number, h: number, w: number, style: number) => {
    const top = Math.max(r, range.start.row), left = Math.max(c, range.start.column);
    const bottom = Math.min(r + h - 1, range.end.row), right = Math.min(c + w - 1, range.end.column);
    if (bottom < top || right < left) return;
    if (top === range.start.row && left === range.start.column && bottom === range.end.row && right === range.end.column) {
      sample.style = style; sample.regions = [];
    } else sample.regions.push({ row: top - range.start.row, column: left - range.start.column, height: bottom - top + 1, width: right - left + 1, style });
  };
  for (const col of artifact.worksheet.columns) if (col.styleIndex !== undefined)
    add(range.start.row, col.min, sample.height, col.max - col.min + 1, col.styleIndex);
  for (const row of artifact.worksheet.rows) {
    if (row.index < range.start.row || row.index > range.end.row) continue;
    if (row.customFormat) add(row.index, range.start.column, 1, sample.width, row.styleIndex ?? 0);
    for (const cell of row.cells) if (cell.styleIndex !== undefined) add(cell.address.row, cell.address.column, 1, 1, cell.styleIndex);
  }
  return sample;
}
/** Tile style regions through the existing sparse row/column formatter. Values and formulas stay. */
export function paintSpreadsheetFormatting(workbook: SpreadsheetWorkbook, sheet: SpreadsheetSheet, range: CellRange, sample: SpreadsheetPainterSample) {
  const formats = openWorksheet(workbook, sheet).styles.cellFormats;
  const format = (style: number, target: CellRange) => {
    const resolved = formats[style];
    if (!resolved) throw new RangeError('Unknown format painter style.');
    const pkg = restyleSpreadsheetRange(workbook, sheet, target, () => resolved);
    workbook = openSpreadsheet(pkg);
    sheet = workbook.sheets.find(s => s.sheetId === sheet.sheetId)!;
    return pkg;
  };
  let result = format(sample.style, range);
  for (const region of sample.regions) {
    const rowStep = sample.height === 1 ? range.end.row - range.start.row + 1 : sample.height;
    const colStep = sample.width === 1 ? range.end.column - range.start.column + 1 : sample.width;
    for (let row = range.start.row + region.row; row <= range.end.row; row += rowStep)
      for (let column = range.start.column + region.column; column <= range.end.column; column += colStep) {
        const height = sample.height === 1 ? rowStep : region.height;
        const width = sample.width === 1 ? colStep : region.width;
        result = format(region.style, { start: { row, column }, end: { row: Math.min(range.end.row, row + height - 1), column: Math.min(range.end.column, column + width - 1) } });
      }
  }
  return result;
}
