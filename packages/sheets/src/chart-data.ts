import { BUBBLE_CHART_POINT_LIMIT, type ChartDataPoint, type ChartDataSequence, type ChartModel, type ChartSeries } from "@tumblerjs/charts";
import { type SpreadsheetCalculationOptions, type SpreadsheetCalculationSnapshot } from "./calculation.ts";
import { formatSpreadsheetCellValue } from "./number-format.ts";
import { type SpreadsheetCellValue, type SpreadsheetWorksheet } from "./worksheet.ts";

export { MAX_CHART_RANGE_CELLS } from './chart-reference.ts';
import { createSpreadsheetChartResolver } from './chart-reference.ts';
export { parseSpreadsheetChartReference } from './chart-reference.ts';
export type { SpreadsheetChartReference } from './chart-reference.ts';

/** Refreshes supported chart series from workbook cells while retaining caches for unsupported references. */
export function resolveSpreadsheetChartData(worksheet: SpreadsheetWorksheet, model: ChartModel, options: SpreadsheetCalculationOptions = {}): ChartModel {
  return resolveSpreadsheetChartDataSet(worksheet, [model], options)[0]!;
}

/** Resolves a worksheet's chart models while sharing formula snapshots across every chart. */
export function resolveSpreadsheetChartDataSet(
  worksheet: SpreadsheetWorksheet,
  models: readonly ChartModel[],
  options: SpreadsheetCalculationOptions = {},
): readonly ChartModel[] {
  const source = createSpreadsheetChartResolver(worksheet,options);

  const resolveSequence = (
    sequence: ChartDataSequence | undefined,
    role: "category" | "value",
  ): ChartDataSequence | undefined => {
    if (sequence?.formula === undefined) return sequence;
    const resolved = source(sequence.formula);
    if (resolved === undefined) return sequence;
    const points: ChartDataPoint[] = [];
    let index = 0;
    for (let row = resolved.range.start.row; row <= resolved.range.end.row; row += 1) {
      for (let column = resolved.range.start.column; column <= resolved.range.end.column; column += 1) {
        const address = { row, column };
        const value = resolved.calculation.value(address) ?? resolved.worksheet.cell(address)?.value;
        const point = chartPoint(role, sequence, index, value, resolved.calculation, address);
        if (point !== undefined) points.push(point);
        index += 1;
      }
    }
    return Object.freeze({ ...sequence, points: Object.freeze(points) });
  };

  return Object.freeze(models.map((model): ChartModel => {
    if (model.status !== "supported") return model;
    const series = model.series.map((item): ChartSeries => {
      const titleSource = item.titleFormula === undefined ? undefined : source(item.titleFormula);
      const title = titleSource === undefined
        ? item.title
        : titleSource.calculation.displayText(titleSource.range.start) || item.title;
      const xValues = resolveSequence(item.xValues, "value");
      const bubbleSizes = resolveSequence(item.bubbleSizes, "value");
      return Object.freeze({
        ...item,
        title,
        categories: resolveSequence(item.categories, model.axes.some(axis => axis.dateAxis) ? "value" : "category"),
        ...(item.errorBars ? { errorBars: item.errorBars.map(errors => { const plus = resolveSequence(errors.plus, "value"), minus = resolveSequence(errors.minus, "value"); return { ...errors, ...(plus ? { plus } : {}), ...(minus ? { minus } : {}) }; }) } : {}),
        ...(xValues === undefined ? {} : { xValues }),
        values: resolveSequence(item.values, "value"),
        ...(bubbleSizes === undefined ? {} : { bubbleSizes }),
      });
    });
    const titleSource = model.titleFormula === undefined ? undefined : source(model.titleFormula);
    const title = titleSource === undefined ? model.title : titleSource.calculation.displayText(titleSource.range.start) || model.title;
    if (model.kind === "bubble") {
      const pointUpperBound = series.reduce((total, item) => total + Math.min(
        item.xValues?.points.length ?? 0,
        item.values?.points.length ?? 0,
        item.bubbleSizes?.points.length ?? 0,
      ), 0);
      if (pointUpperBound > BUBBLE_CHART_POINT_LIMIT) {
        return Object.freeze({
          status: "unsupported", chartType: "bubbleChart",
          reason: `Bubble chart exceeds ${BUBBLE_CHART_POINT_LIMIT} potential points.`,
          title, legend: model.legend,
        });
      }
    }
    return Object.freeze({ ...model, dateSystem: worksheet.workbook.dateSystem, title, series: Object.freeze(series) });
  }));
}

function chartPoint(
  role: "category" | "value",
  sequence: ChartDataSequence,
  index: number,
  value: SpreadsheetCellValue | undefined,
  calculation: SpreadsheetCalculationSnapshot,
  address: { readonly row: number; readonly column: number },
): ChartDataPoint | undefined {
  if (role === "category") {
    if (value?.type === "number" && sequence.formatCode !== undefined && sequence.formatCode.toLowerCase() !== "general") {
      return Object.freeze({
        index,
        value: formatSpreadsheetCellValue(value, {
          numberFormatCode: sequence.formatCode,
          dateSystem: calculation.worksheet.workbook.dateSystem,
        }),
      });
    }
    return Object.freeze({ index, value: calculation.displayText(address) });
  }
  if (sequence.kind === "string") return Object.freeze({ index, value: calculation.displayText(address) });
  if (value?.type === "number") return Object.freeze({ index, value: value.value });
  if (value?.type === "boolean") return Object.freeze({ index, value: value.value ? 1 : 0 });
  // Numeric chart series treat text, errors, and blank cells as gaps.
  return undefined;
}
