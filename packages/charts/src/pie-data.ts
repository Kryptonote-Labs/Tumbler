import type { ChartSeries } from './model.ts';
import type { PieSlice } from './layout.ts';

/** Size slices by magnitude while retaining signed source values and native point identities. */
export function chartPieData(series: ChartSeries | undefined) {
  const points = series?.values?.points.flatMap(point => typeof point.value === 'number' && Number.isFinite(point.value) && point.value !== 0 ? [{ index: point.index, value: point.value }] : []) ?? [];
  const scale = points.reduce((maximum, point) => Math.max(maximum, Math.abs(point.value)), 0);
  const total = points.reduce((sum, point) => sum + Math.abs(point.value) / scale, 0);
  const fractions = new Map(points.map(point => [point.index, Math.abs(point.value) / scale / total]));
  return { points, fractions };
}

/** Keep source identities and values independent of normalized geometry, including zero-angle slices. */
export function chartPieSlices(points: readonly { readonly index: number; readonly value: number }[], fractions: ReadonlyMap<number, number>, firstAngle: number): readonly PieSlice[] {
  let angle = -Math.PI / 2 + firstAngle * Math.PI / 180;
  return Object.freeze(points.map(point => {
    const startAngle = angle;
    angle += (fractions.get(point.index) ?? 0) * Math.PI * 2;
    return Object.freeze({ ...point, startAngle, endAngle: angle });
  }));
}
