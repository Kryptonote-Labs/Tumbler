import { SparseAxisGeometry } from "@tumblerjs/core";
import {
  type SpreadsheetCalculationSnapshot,
  type SpreadsheetWorksheet,
} from "@tumblerjs/sheets";

export interface SpreadsheetTextOverflowInput {
  readonly worksheet: SpreadsheetWorksheet;
  readonly calculation?: SpreadsheetCalculationSnapshot;
  readonly row: number;
  readonly column: number;
  readonly columnGeometry: SparseAxisGeometry;
  readonly maximumColumn: number;
  readonly frozenColumns?: number;
}

/**
 * Returns the horizontal paint width for an Excel-style text spill into blank
 * cells. The source cell remains its authored width and owns all interaction.
 */
export function spreadsheetTextOverflowWidth(input: SpreadsheetTextOverflowInput): number | undefined {
  const { worksheet, calculation, row, column, columnGeometry } = input;
  const cell = worksheet.cell({ row, column });
  const value = calculation?.value({ row, column }) ?? cell?.value;
  const style = worksheet.cellStyle({ row, column });
  const horizontal = style.alignment.horizontal;

  if (value?.type !== "string" || value.value.length === 0) return undefined;
  if (worksheet.mergedRange({ row, column }) !== undefined || worksheet.hyperlink({ row, column }) !== undefined) return undefined;
  if (style.alignment.wrapText || style.alignment.shrinkToFit || style.alignment.textRotation !== 0) return undefined;
  if (style.alignment.readingOrder === 2 || (horizontal !== undefined && horizontal !== "general" && horizontal !== "left")) return undefined;

  const maximumColumn = Math.min(columnGeometry.count, Math.max(column, Math.floor(input.maximumColumn)));
  const sourceFrozen = column <= (input.frozenColumns ?? 0);
  let width = columnGeometry.size(column);

  for (let candidate = column + 1; candidate <= maximumColumn; candidate += 1) {
    if ((candidate <= (input.frozenColumns ?? 0)) !== sourceFrozen) break;
    if (occupied(worksheet, row, candidate)) break;
    width += columnGeometry.size(candidate);
  }

  return width > columnGeometry.size(column) ? width : undefined;
}

function occupied(worksheet: SpreadsheetWorksheet, row: number, column: number): boolean {
  if (worksheet.mergedRange({ row, column }) !== undefined || worksheet.hyperlink({ row, column }) !== undefined) return true;
  const cell = worksheet.cell({ row, column });
  return cell !== undefined && (cell.formula !== undefined || cell.value.type !== "blank");
}
