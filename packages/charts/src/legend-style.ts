import type { SupportedChartModel } from './model.ts';
import { chartFont, type ChartColorResolver } from './scene-style.ts';

/** Legend indices address the complete entry list, including entries hidden by delete. */
export function chartLegendEntries<T extends { readonly label: string }>(model: SupportedChartModel, entries: readonly T[], resolve?: ChartColorResolver) {
  return entries.flatMap((entry, index) => {
    const override = model.legend?.entries?.[index];
    return override?.deleted ? [] : [{ ...entry, legendIndex: index, font: chartFont('legend', { ...model.legend?.textStyle, ...override?.textStyle }, model, resolve) }];
  });
}
