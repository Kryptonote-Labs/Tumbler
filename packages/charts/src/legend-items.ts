import type { ChartSeries, SupportedChartModel } from './model.ts';
import type { ChartTrendline } from './analytics-parser.ts';
import type { ChartSceneOptions } from './scene-marks.ts';
import { chartAxisFormat } from './axis-labels.ts';
import { chartTickLabel } from './tick-label.ts';
import { indexChartSequence } from './indexed-data.ts';

export type ChartLegendItem =
  | { readonly kind: 'series'; readonly label: string; readonly series: ChartSeries; readonly seriesIndex: number }
  | { readonly kind: 'point'; readonly label: string; readonly series: ChartSeries; readonly seriesIndex: number; readonly pointIndex: number }
  | { readonly kind: 'trendline'; readonly label: string; readonly series: ChartSeries; readonly seriesIndex: number; readonly trendline: ChartTrendline }
  | { readonly kind: 'band'; readonly label: string; readonly bandIndex: number };

/** Build the complete native list before applying positional legendEntry overrides. */
export function chartLegendItems(model: SupportedChartModel, bands?: readonly number[], options: ChartSceneOptions = {}): readonly ChartLegendItem[] {
  if (model.kind === 'surface') {
    const axis = model.axes.find(axis => axis.kind === 'value');
    return (bands ?? []).slice(0, -1).map((minimum, bandIndex) => ({ kind: 'band', bandIndex,
      label: `${chartTickLabel(minimum, chartAxisFormat(model, axis), options)}–${chartTickLabel(bands![bandIndex + 1]!, chartAxisFormat(model, axis), options)}` }));
  }
  const pie = ['pie', 'doughnut', 'of-pie'].includes(model.kind);
  const points = pie || model.varyColors && model.series.length === 1 && !['area', 'stock'].includes(model.kind) && !(model.kind === 'radar' && model.radarStyle === 'filled');
  const ordered = model.series.map((series, seriesIndex) => ({ series, seriesIndex })).toSorted((a, b) => a.series.order - b.series.order);
  if (points) {
    const first = ordered[0];
    if (!first) return [];
    const categories = indexChartSequence(first.series.categories);
    return first.series.values?.points.filter(point => typeof point.value === 'number').map(point => ({ kind: 'point', ...first, pointIndex: point.index, label: String(categories.get(point.index) ?? point.index + 1) })) ?? [];
  }
  const names: Record<ChartTrendline['type'], string> = { linear: 'Linear', exp: 'Exponential', log: 'Logarithmic', poly: 'Polynomial', power: 'Power', movingAvg: 'Mov. Avg.' };
  return ordered.flatMap(({ series, seriesIndex }): ChartLegendItem[] => {
    const label = series.title ?? `Series ${seriesIndex + 1}`;
    return [{ kind: 'series', series, seriesIndex, label }, ...(series.trendlines ?? []).map(trendline => ({ kind: 'trendline' as const, series, seriesIndex, trendline,
      label: trendline.name ?? `${trendline.type === 'movingAvg' ? `${trendline.period} per. ` : ''}${names[trendline.type]} (${label})` }))];
  });
}

export function chartSurfaceLevels(layout: { readonly minimum: number; readonly maximum: number; readonly ticks: readonly number[] }): readonly number[] {
  return [...new Set([layout.minimum, ...layout.ticks.filter(tick => tick > layout.minimum && tick < layout.maximum), layout.maximum])].sort((a, b) => a - b);
}
