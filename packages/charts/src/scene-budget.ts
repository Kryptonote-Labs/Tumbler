import type { SupportedChartModel } from './model.ts';

/** Product preview limits, independent of OOXML cache counts and unsigned index syntax. */
export const CHART_CATEGORY_LIMIT = 20_000;
export const CHART_SCENE_CELL_LIMIT = 20_000;
const STORED_POINT_LIMIT = 100_000;

/** Check before allocating category arrays, maps or marks, including programmatic models. */
export function assertChartSceneBudget(model: SupportedChartModel): number {
  const plots = model.plots ?? [];
  if (plots.length > 16) throw new RangeError('Chart preview exceeds 16 plots.');
  let stored = 0;
  let cells = 0;
  let rootCount = 0;
  for (const current of [model, ...plots]) {
    if (current.series.length > 256 || current.axes.length > 256) throw new RangeError('Chart preview exceeds 256 series or axes.');
    let categories = 0;
    for (const series of current.series) {
      for (const sequence of [series.categories, series.values, series.xValues, series.bubbleSizes]) {
        if (!sequence) continue;
        for (const points of [sequence.points, ...(sequence.levels ?? [])]) {
          stored += points.length;
          if (stored > STORED_POINT_LIMIT) throw new RangeError(`Chart preview exceeds ${STORED_POINT_LIMIT} stored points.`);
          for (const point of points) {
            if (!Number.isSafeInteger(point.index) || point.index < 0 || point.index >= 100_000) throw new RangeError('Chart cache index exceeds preview limits.');
            if (sequence === series.categories || sequence === series.values) categories = Math.max(categories, point.index + 1);
          }
        }
      }
    }
    const cartesian = current.kind === 'bar' || current.kind === 'column' || current.kind === 'line';
    if (cartesian && categories > CHART_CATEGORY_LIMIT) throw new RangeError(`Chart preview exceeds ${CHART_CATEGORY_LIMIT} categories.`);
    // Combination plots share the root category domain, including gaps in other plots.
    if (current === model) rootCount = categories;
    cells += cartesian ? Math.max(categories, rootCount) * current.series.length : current.series.reduce((n, s) => n + (s.values?.points.length ?? 0), 0);
    if (cells > CHART_SCENE_CELL_LIMIT) throw new RangeError(`Chart preview exceeds ${CHART_SCENE_CELL_LIMIT} series/category cells.`);
  }
  return rootCount;
}
