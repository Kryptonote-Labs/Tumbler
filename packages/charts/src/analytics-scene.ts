import { chartStrokeMark } from './stroke-scene.ts';
import type { ChartSeries } from './model.ts';
import { chartErrorExtents } from './error-bars.ts';
import { fitChartTrendline, type TrendPoint } from './trendline.ts';
import { chartFont, chartStroke } from './scene-style.ts';
import { line, type ChartMark, type SceneContext } from './scene-marks.ts';

export interface ChartProjection {
  (x: number, y: number): { readonly x: number; readonly y: number };
}

/** Hosts supply the same projection used for data marks, including horizontal and XY charts. */
export function chartAnalyticsMarks(context: SceneContext, series: ChartSeries, seriesIndex: number, points: readonly TrendPoint[], project: ChartProjection): { readonly geometry: readonly ChartMark[]; readonly annotations: readonly ChartMark[] } {
  const marks: ChartMark[] = [], annotations: ChartMark[] = [];
  for (const errors of series.errorBars ?? []) {
    const extents = chartErrorExtents(points, errors);
    const style = chartStroke('axis', errors.lineStyle, context.model, context.options.resolveColor);
    points.forEach((point, index) => {
      const extent = extents[index]!;
      const center = project(point.x, point.y);
      const horizontal = errors.direction === 'x';
      const minus = project(point.x - (horizontal ? extent.minus : 0), point.y - (horizontal ? 0 : extent.minus));
      const plus = project(point.x + (horizontal ? extent.plus : 0), point.y + (horizontal ? 0 : extent.plus));
      if (extent.minus) marks.push(...line(center.x, center.y, minus.x, minus.y, style));
      if (extent.plus) marks.push(...line(center.x, center.y, plus.x, plus.y, style));
      if (!errors.noEndCap) for (const end of [extent.minus ? minus : undefined, extent.plus ? plus : undefined]) {
        if (!end) continue;
        const dx = plus.x - minus.x, dy = plus.y - minus.y, length = Math.hypot(dx, dy);
        if (length) marks.push(...line(end.x - 3 * dy / length, end.y + 3 * dx / length, end.x + 3 * dy / length, end.y - 3 * dx / length, style));
      }
    });
  }
  for (const trend of series.trendlines ?? []) {
    const fit = fitChartTrendline(points, trend);
    if (!fit?.points.length) continue;
    const style = chartStroke('axis', { color: series.line ?? series.fill ?? { kind: 'scheme', value: `accent${seriesIndex % 6 + 1}` }, width: 1.5, ...trend.lineStyle }, context.model, context.options.resolveColor);
    const projected = fit.points.map(point => project(point.x, point.y));
    if (style.stroke) marks.push({ kind: 'path', d: projected.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '), ...chartStrokeMark(style) });
    const annotation = [trend.displayEquation ? fit.equation : undefined, trend.displayRSquared && fit.rSquared !== undefined ? `R² = ${Number(fit.rSquared.toPrecision(6))}` : undefined].filter((value): value is string => value !== undefined);
    const last = projected.at(-1)!;
    const font = chartFont('dataLabel', trend.labelStyle, context.model, context.options.resolveColor);
    annotation.forEach((text, index) => annotations.push({ kind: 'text', text, x: last.x - 6, y: last.y - 6 - (annotation.length - index - 1) * font.size * 1.2, anchor: 'end', font }));
  }
  return { geometry: marks, annotations };
}
