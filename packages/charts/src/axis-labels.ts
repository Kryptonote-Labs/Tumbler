import type { ChartAxis, SupportedChartModel } from './model.ts';
import type { CartesianChartLayout } from './layout.ts';
import type { ChartSceneOptions } from './scene-marks.ts';
import { chartTickLabel } from './tick-label.ts';

export function chartAxisFormat(model: SupportedChartModel, axis: ChartAxis | undefined, sequence: 'values' | 'xValues' | 'categories' = 'values'): string | undefined {
  return axis?.numberFormatCode ?? model.series.find(series => series[sequence]?.formatCode !== undefined)?.[sequence]?.formatCode;
}

/** Measurement and painting use the same native date ticks and cached number-format fallback. */
export function chartCategoryAxisLabels(model: SupportedChartModel, layout: CartesianChartLayout, options: ChartSceneOptions = { dateSystem: model.dateSystem ?? '1900' }): readonly string[] {
  const axis = model.axes.find(axis => axis.kind === 'category');
  return layout.categoryScale ? layout.categoryScale.ticks.map(value => chartTickLabel(value, chartAxisFormat(model, axis, 'categories') ?? 'm/d/yyyy', options)) : layout.categories;
}
