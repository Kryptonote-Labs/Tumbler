import { resolveChartColor } from './colors.ts';
import type { ChartSeries } from './model.ts';
import type { SceneContext } from './scene-marks.ts';

/** Resolve per-point formatting before series defaults and the host's theme palette. */
export function chartPointColor(context: SceneContext, series: ChartSeries, seriesIndex: number, index: number, line = false): string {
  const point = context.pointFormat(series, index);
  const explicit = line ? point?.lineStyle?.color : point?.fill;
  const noFill = line ? point?.lineStyle?.noFill : point?.noFill;
  if (noFill) return 'none';
  if (explicit) return context.options.resolveColor?.(explicit) ?? resolveChartColor(explicit, context.model) ?? context.color(series, seriesIndex, line);
  if (line ? series.lineStyle?.noFill : series.noFill) return 'none';
  if (line ? series.lineStyle?.color || series.line : series.fill) return context.color(series, seriesIndex, line);
  // MS-OI29500 2.1.1571: multiple series and these filled plots keep series colours.
  const variation = context.model.varyColors ?? ['pie', 'doughnut', 'of-pie'].includes(context.model.kind);
  const varies = variation && context.model.series.length === 1 && !['area', 'stock'].includes(context.model.kind) && !(context.model.kind === 'radar' && context.model.radarStyle === 'filled');
  return varies ? context.color({ ...series, fill: undefined, line: undefined }, index, line) : context.color(series, seriesIndex, line);
}
