import type { DrawingGradient } from '@tumblerjs/ooxml';
import type { ChartGradient, ChartSeries } from './model.ts';
import type { ChartRect } from './layout.ts';
import type { SceneContext } from './scene-marks.ts';
import { resolveChartColor } from './colors.ts';

export interface ChartGradientPaint {
  readonly gradient: DrawingGradient;
  readonly bounds: ChartRect;
}

/** Resolve authored gradient stops using the same host colour binding as solid paint. */
export function chartGradientPaint(context: SceneContext, gradient: ChartGradient | undefined, bounds: ChartRect): { readonly fillGradient?: ChartGradientPaint } {
  if (!gradient) return {};
  return { fillGradient: { bounds, gradient: { ...gradient, stops: gradient.stops.map(stop => ({ offset: stop.offset, color: context.options.resolveColor?.(stop.color) ?? resolveChartColor(stop.color, context.model) ?? 'transparent' })) } } };
}

/** A point's explicit solid/no-fill choice replaces the entire inherited series fill. */
export function chartPointGradient(context: SceneContext, series: ChartSeries, index: number, bounds: ChartRect) {
  const point = context.pointFormat(series, index);
  const gradient = point?.gradient ?? (point?.fill || point?.noFill ? undefined : series.noFill ? undefined : series.gradient);
  return chartGradientPaint(context, gradient, bounds);
}

/** Legend swatches use the series' complete fill, including explicit transparency. */
export function chartLegendFill(context: SceneContext, series: ChartSeries, bounds: ChartRect) {
  return chartGradientPaint(context, series.noFill ? undefined : series.gradient, bounds);
}
