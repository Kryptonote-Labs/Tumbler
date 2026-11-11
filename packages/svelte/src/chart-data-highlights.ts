import { chartDataState } from './chart-data-state.ts';
import { parseSpreadsheetChartReference } from '@tumblerjs/sheets';
import type { GridSelection } from '@tumblerjs/core';

/** Source ranges are view decoration; they never change workbook selection or document content. */
export function chartDataHighlights(source: Uint8Array, sheet: string, colors: Readonly<Record<string, string>> = {}): readonly { readonly range: GridSelection['range']; readonly color: string }[] {
  const palette = ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47'];
  const seen = new Set<string>();
  return chartDataState(source).plots.flatMap(plot => plot.series).flatMap((series, index) => {
    const color = colors[`accent${index % 6 + 1}`] ?? palette[index % palette.length]!;
    return [
      { formula: series.nameFormula, color }, { formula: series.categories?.formula, color: colors.tx1 ?? '#a0a0a0' },
      ...[series.values, series.xValues, series.bubbleSizes, ...(series.errorBars?.flatMap(error => [error.plus, error.minus]) ?? [])].map(sequence => ({ formula: sequence?.formula, color })),
    ].flatMap(({ formula, color }) => {
      const reference = formula && parseSpreadsheetChartReference(formula, sheet);
      if (!reference || reference.sheet.toLowerCase() !== sheet.toLowerCase()) return [];
      const key = JSON.stringify(reference.range);
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ range: reference.range, color }];
    });
  });
}
