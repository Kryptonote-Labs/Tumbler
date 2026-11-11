import type { ChartErrorBars } from './analytics-parser.ts';
import type { ChartDataSequence } from './model.ts';
import type { TrendPoint } from './trendline.ts';

export interface ChartErrorExtent { readonly index: number; readonly minus: number; readonly plus: number }

/** Custom amounts match cache indexes; statistical amounts use sample standard deviation. */
export function chartErrorExtents(points: readonly TrendPoint[], errors: ChartErrorBars): readonly ChartErrorExtent[] {
  const values = points.map(point => errors.direction === 'x' ? point.x : point.y);
  const magnitude = Math.max(0, ...values.map(Math.abs));
  let count = 0, mean = 0, sumSquares = 0;
  for (const original of values) { const value = magnitude ? original / magnitude : 0; count++; const delta = value - mean; mean += delta / count; sumSquares += delta * (value - mean); }
  const deviation = count > 1 ? Math.sqrt(Math.max(0, sumSquares / (count - 1))) * magnitude : 0;
  const custom = (sequence: ChartDataSequence | undefined) => new Map(sequence?.points.flatMap(point => typeof point.value === 'number' ? [[point.index, Math.abs(point.value)] as const] : []));
  const plus = custom(errors.plus), minus = custom(errors.minus);
  return points.map((point, index) => {
    const amount = errors.valueType === 'stdErr' ? deviation / Math.sqrt(Math.max(1, count)) : errors.valueType === 'stdDev' ? deviation * errors.value
      : errors.valueType === 'percentage' ? Math.abs(values[index]!) * errors.value / 100 : errors.value;
    return { index: point.index, minus: errors.type === 'plus' ? 0 : errors.valueType === 'cust' ? minus.get(point.index) ?? 0 : amount,
      plus: errors.type === 'minus' ? 0 : errors.valueType === 'cust' ? plus.get(point.index) ?? 0 : amount };
  });
}
