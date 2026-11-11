import type { ChartSeries } from './model.ts';
import { chartErrorExtents } from './error-bars.ts';
import { fitChartTrendline, type TrendPoint } from './trendline.ts';

/** Numeric chart data keeps cache indexes paired across sparse X/Y sequences. */
export function chartAnalyticalPoints(series: ChartSeries, xy: boolean): readonly TrendPoint[] {
  const x = new Map(series.xValues?.points.map(point => [point.index, point.value]));
  return series.values?.points.flatMap(point => {
    const coordinate = xy ? x.get(point.index) : point.index + 1;
    return typeof coordinate === 'number' && typeof point.value === 'number' ? [{ index: point.index, x: coordinate, y: point.value }] : [];
  }) ?? [];
}

export function chartAnalyticalBounds(series: ChartSeries, points: readonly TrendPoint[]) {
  let xMinimum = Infinity, xMaximum = -Infinity, yMinimum = Infinity, yMaximum = -Infinity, xPositiveMinimum = Infinity, yPositiveMinimum = Infinity;
  const include = (x: number, y: number) => { if (Number.isFinite(x)) { xMinimum = Math.min(xMinimum, x); xMaximum = Math.max(xMaximum, x); if (x > 0) xPositiveMinimum = Math.min(xPositiveMinimum, x); } if (Number.isFinite(y)) { yMinimum = Math.min(yMinimum, y); yMaximum = Math.max(yMaximum, y); if (y > 0) yPositiveMinimum = Math.min(yPositiveMinimum, y); } };
  points.forEach(point => include(point.x, point.y));
  for (const error of series.errorBars ?? []) chartErrorExtents(points, error).forEach((extent, index) => {
    const point = points[index]!;
    include(point.x - (error.direction === 'x' ? extent.minus : 0), point.y - (error.direction === 'y' ? extent.minus : 0));
    include(point.x + (error.direction === 'x' ? extent.plus : 0), point.y + (error.direction === 'y' ? extent.plus : 0));
  });
  for (const trend of series.trendlines ?? []) fitChartTrendline(points, trend)?.points.forEach(point => include(point.x, point.y));
  return { xMinimum, xMaximum, yMinimum, yMaximum, xPositiveMinimum, yPositiveMinimum };
}

/** Error bars on stacked series start at the visible stack endpoint. Percent stacks scale amounts too. */
export function cartesianAnalyticalData(model: import('./model.ts').SupportedChartModel, stacks: readonly (readonly (import('./indexed-data.ts').StackPoint | undefined)[])[]) {
  const stacked = model.grouping === 'stacked' || model.grouping === 'percent-stacked';
  const totals = new Map<number, number>();
  if (model.grouping === 'percent-stacked') for (const series of model.series) for (const point of series.values?.points ?? []) if (typeof point.value === 'number') totals.set(point.index, (totals.get(point.index) ?? 0) + Math.abs(point.value));
  return model.series.map((series, seriesIndex) => {
    if (!series.errorBars?.length && (!series.trendlines?.length || stacked)) return { series: { ...series, trendlines: [], errorBars: [] }, points: [] };
    const raw = chartAnalyticalPoints(series, false);
    if (!stacked) return { series, points: raw };
    const points = raw.flatMap(point => { const stack = stacks[seriesIndex]?.[point.index]; return stack ? [{ ...point, y: stack.end }] : []; });
    const errors = series.errorBars?.map(error => {
      const amounts = chartErrorExtents(raw, error);
      const sequence = (side: 'plus' | 'minus') => ({ kind: 'number' as const, formula: undefined, formatCode: undefined, points: amounts.map(amount => ({ index: amount.index, value: amount[side] * (error.direction === 'y' && model.grouping === 'percent-stacked' ? 1 / (totals.get(amount.index) || 1) : 1) })) });
      return { ...error, valueType: 'cust' as const, plus: sequence('plus'), minus: sequence('minus') };
    });
    return { series: { ...series, trendlines: [], ...(errors ? { errorBars: errors } : {}) }, points };
  });
}
