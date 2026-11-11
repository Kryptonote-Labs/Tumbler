import type { ChartLineStyle, ChartSeries } from './model.ts';
import type { SceneContext } from './scene-marks.ts';
import { chartStroke, type ChartStroke, type ChartStrokeDecoration } from './scene-style.ts';

export function chartStrokeMark({ width, stroke, ...decoration }: ChartStroke) {
  return { ...decoration, ...(stroke === undefined ? {} : { stroke }), strokeWidth: stroke === undefined ? 0 : width };
}
export function chartSeriesStroke(context: SceneContext, series: ChartSeries, index: number): ChartStroke {
  const style = chartStroke('axis', { width: 1.5, ...series.lineStyle }, context.model, context.options.resolveColor);
  return { ...style, stroke: series.lineStyle?.noFill ? undefined : series.lineStyle?.color ? style.stroke : context.color(series, index, true) };
}

/** Point line properties inherit omitted series properties; an explicit paint overrides inherited no-fill. */
export function chartPointStroke(context: SceneContext, series: ChartSeries, seriesIndex: number, pointIndex: number, defaultColor?: string): ChartStrokeDecoration & { readonly stroke?: string; readonly strokeWidth?: number } {
  const override = context.pointFormat(series, pointIndex)?.lineStyle;
  if (!override && !series.lineStyle) return defaultColor ? { stroke: defaultColor, strokeWidth: 1 } : {};
  const line: ChartLineStyle = { ...series.lineStyle, ...override, ...(override?.color && !override.noFill ? { noFill: false } : {}) };
  const style = chartStroke('axis', line, context.model, context.options.resolveColor);
  return chartStrokeMark({ ...style, stroke: line.noFill ? undefined : line.color ? style.stroke : context.color(series, seriesIndex, true) });
}
