import { resolveChartColor } from './colors.ts';
import type { ChartSeries } from './model.ts';
import type { SceneContext } from './scene-marks.ts';

/** Resolve per-point formatting before series defaults and the host's theme palette. */
export function chartPointColor(context: SceneContext, series: ChartSeries, seriesIndex: number, index: number, line = false): string {
  const point = context.pointFormat(series, index);
  if (!line && (point?.noFill ?? series.noFill)) return 'none';
  if (line && (point?.lineStyle?.noFill ?? series.lineStyle?.noFill)) return 'none';
  const authored = line ? point?.lineStyle?.color ?? point?.fill : point?.fill;
  if (authored) return context.options.resolveColor?.(authored) ?? resolveChartColor(authored, context.model) ?? context.color(series, seriesIndex, line);
  const varies = context.model.varyColors ?? ['pie', 'doughnut', 'of-pie'].includes(context.model.kind);
  return varies ? context.color({ ...series, fill: undefined, line: undefined }, index, line) : context.color(series, seriesIndex, line);
}

