import {
  calculateSpreadsheetWorksheet,
  type SpreadsheetCalculationOptions,
  type SpreadsheetCalculationSnapshot,
} from './calculation.ts';
import { openWorksheet, type SpreadsheetWorksheet } from './worksheet.ts';
import { parseCellRange, type CellRange } from './references.ts';

export interface SpreadsheetChartReference {
  readonly sheet: string;
  readonly range: CellRange;
}

/** Resolves the internal A1-reference subset used by ordinary chart formulas. */
export function parseSpreadsheetChartReference(
  formula: string,
  currentSheet: string,
): SpreadsheetChartReference | undefined {
  const source = formula.startsWith('=') ? formula.slice(1) : formula;
  if (source.includes('[') || source.includes(']')) return undefined;
  const split = splitSheetReference(source);
  const sheet = split?.sheet ?? currentSheet;
  const reference = (split?.reference ?? source).replaceAll('$', '');
  if (reference.includes(',')) return undefined;
  try {
    const range = parseCellRange(reference);
    return Object.freeze({ sheet, range });
  } catch {
    return undefined;
  }
}

// A projection budget, not an authoring limit. Native formulas and caches survive larger references.
export const MAX_CHART_RANGE_CELLS = 100_000;
/** Display and inspection share reference parsing, calculation snapshots and bounded projection. */
export function createSpreadsheetChartResolver(
  worksheet: SpreadsheetWorksheet,
  options: SpreadsheetCalculationOptions = {},
  initial?: SpreadsheetCalculationSnapshot,
) {
  const snapshots = new Map<number, SpreadsheetCalculationSnapshot>();
  if (initial) snapshots.set(worksheet.sheet.sheetId, initial);
  let remainingCells = MAX_CHART_RANGE_CELLS;
  return (formula: string) => {
    const reference = parseSpreadsheetChartReference(formula, worksheet.sheet.name);
    if (!reference) return;
    const { start, end } = reference.range;
    const cells = (end.row - start.row + 1) * (end.column - start.column + 1);
    if (cells > remainingCells) return;
    const sheet = worksheet.workbook.sheet(reference.sheet);
    if (!sheet) return;
    remainingCells -= cells;
    let calculation = snapshots.get(sheet.sheetId);
    if (!calculation) {
      calculation = calculateSpreadsheetWorksheet(
        sheet.sheetId === worksheet.sheet.sheetId
          ? worksheet
          : openWorksheet(worksheet.workbook, sheet),
        options,
      );
      snapshots.set(sheet.sheetId, calculation);
    }
    return { worksheet: calculation.worksheet, calculation, range: reference.range };
  };
}

function splitSheetReference(
  source: string,
): { readonly sheet: string; readonly reference: string } | undefined {
  if (source.startsWith("'")) {
    let sheet = '';
    for (let index = 1; index < source.length; index += 1) {
      if (source[index] !== "'") {
        sheet += source[index];
        continue;
      }
      if (source[index + 1] === "'") {
        sheet += "'";
        index += 1;
        continue;
      }
      return source[index + 1] === '!' && index + 2 < source.length
        ? { sheet, reference: source.slice(index + 2) }
        : undefined;
    }
    return undefined;
  }
  const separator = source.lastIndexOf('!');
  return separator > 0 && separator + 1 < source.length
    ? { sheet: source.slice(0, separator), reference: source.slice(separator + 1) }
    : undefined;
}
