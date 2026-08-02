import type { ChartDataPoint, ChartDataSequence, ChartModel, ChartSeries } from "@tumbler/charts";
import type { CellRange } from "./references.ts";
import { parseCellRange } from "./references.ts";
import { calculateSpreadsheetWorksheet, type SpreadsheetCalculationSnapshot } from "./calculation.ts";
import { openWorksheet, type SpreadsheetCellValue, type SpreadsheetWorksheet } from "./worksheet.ts";

const MAX_CHART_RANGE_CELLS = 100_000;

export interface SpreadsheetChartReference {
  readonly sheet: string;
  readonly range: CellRange;
}

/** Resolves the internal A1-reference subset used by ordinary chart formulas. */
export function parseSpreadsheetChartReference(formula: string, currentSheet: string): SpreadsheetChartReference | undefined {
  const source = formula.startsWith("=") ? formula.slice(1) : formula;
  if (source.includes("[") || source.includes("]") || source.includes(",")) return undefined;
  const split = splitSheetReference(source);
  const sheet = split?.sheet ?? currentSheet;
  const reference = (split?.reference ?? source).replaceAll("$", "");
  try {
    const range = parseCellRange(reference);
    const count = (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1);
    return count <= MAX_CHART_RANGE_CELLS ? Object.freeze({ sheet, range }) : undefined;
  } catch {
    return undefined;
  }
}

/** Refreshes supported chart series from workbook cells while retaining caches for unsupported references. */
export function resolveSpreadsheetChartData(worksheet: SpreadsheetWorksheet, model: ChartModel): ChartModel {
  if (model.status !== "supported") return model;
  const snapshots = new Map<number, SpreadsheetCalculationSnapshot>();
  snapshots.set(worksheet.sheet.sheetId, calculateSpreadsheetWorksheet(worksheet));

  const source = (formula: string): { worksheet: SpreadsheetWorksheet; calculation: SpreadsheetCalculationSnapshot; range: CellRange } | undefined => {
    const reference = parseSpreadsheetChartReference(formula, worksheet.sheet.name);
    if (reference === undefined) return undefined;
    const sheet = worksheet.workbook.sheet(reference.sheet);
    if (sheet === undefined) return undefined;
    let calculation = snapshots.get(sheet.sheetId);
    if (calculation === undefined) {
      const target = openWorksheet(worksheet.workbook, sheet);
      calculation = calculateSpreadsheetWorksheet(target);
      snapshots.set(sheet.sheetId, calculation);
    }
    return { worksheet: calculation.worksheet, calculation, range: reference.range };
  };

  const resolveSequence = (sequence: ChartDataSequence | undefined): ChartDataSequence | undefined => {
    if (sequence?.formula === undefined) return sequence;
    const resolved = source(sequence.formula);
    if (resolved === undefined) return sequence;
    const points: ChartDataPoint[] = [];
    let index = 0;
    for (let row = resolved.range.start.row; row <= resolved.range.end.row; row += 1) {
      for (let column = resolved.range.start.column; column <= resolved.range.end.column; column += 1) {
        const address = { row, column };
        const value = resolved.calculation.value(address) ?? resolved.worksheet.cell(address)?.value;
        const point = chartPoint(sequence.kind, index, value, resolved.calculation, address);
        if (point !== undefined) points.push(point);
        index += 1;
      }
    }
    return Object.freeze({ ...sequence, points: Object.freeze(points) });
  };

  const series = model.series.map((item): ChartSeries => {
    const titleSource = item.titleFormula === undefined ? undefined : source(item.titleFormula);
    const title = titleSource === undefined
      ? item.title
      : titleSource.calculation.displayText(titleSource.range.start) || item.title;
    return Object.freeze({ ...item, title, categories: resolveSequence(item.categories), values: resolveSequence(item.values) });
  });
  return Object.freeze({ ...model, series: Object.freeze(series) });
}

function chartPoint(
  kind: ChartDataSequence["kind"],
  index: number,
  value: SpreadsheetCellValue | undefined,
  calculation: SpreadsheetCalculationSnapshot,
  address: { readonly row: number; readonly column: number },
): ChartDataPoint | undefined {
  if (kind === "string") return Object.freeze({ index, value: calculation.displayText(address) });
  if (value?.type === "number") return Object.freeze({ index, value: value.value });
  if (value?.type === "boolean") return Object.freeze({ index, value: value.value ? 1 : 0 });
  // Numeric chart series treat text, errors, and blank cells as gaps.
  return undefined;
}

function splitSheetReference(source: string): { readonly sheet: string; readonly reference: string } | undefined {
  if (source.startsWith("'")) {
    let sheet = "";
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
      return source[index + 1] === "!" && index + 2 < source.length
        ? { sheet, reference: source.slice(index + 2) }
        : undefined;
    }
    return undefined;
  }
  const separator = source.lastIndexOf("!");
  return separator > 0 && separator + 1 < source.length
    ? { sheet: source.slice(0, separator), reference: source.slice(separator + 1) }
    : undefined;
}
