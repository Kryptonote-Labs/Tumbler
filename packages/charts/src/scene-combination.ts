import { layoutCombinationChart } from './combination.ts';
import { cartesianScene } from './scene-cartesian.ts';
import { legendMarks, type ChartMark, type SceneContext } from './scene-marks.ts';

/** Each plot uses the shared categorical renderer, retaining its own axes and analytical properties. */
export function combinationScene(context: SceneContext): ChartMark[] {
  const { model, width, height } = context;
  const plots = layoutCombinationChart(model, width, height, context.measure);
  const marks: ChartMark[] = [], seenAxes = new Set<number>();
  for (const [plotIndex, plot] of plots.entries()) {
    const { plotArea, ...plotModel } = plot.model;
    const axes = plot.model.axes.map(axis => ({ ...axis, deleted: axis.deleted || seenAxes.has(axis.id) }));
    plot.model.axes.forEach(axis => { if (!axis.deleted) seenAxes.add(axis.id); });
    const current: SceneContext = {
      ...context,
      model: { ...plotModel, ...(plotIndex === 0 && plotArea ? { plotArea } : {}), title: undefined, legend: undefined, axes, ...(model.themeColors ? { themeColors: model.themeColors } : {}), ...(model.themeFonts ? { themeFonts: model.themeFonts } : {}) },
      color: (series, index, line) => context.color(series, Math.max(0, model.series.findIndex(item => item.index === series.index)), line),
    };
    marks.push(...cartesianScene(current, true, plot.layout));
  }
  if (model.legend) marks.push(...legendMarks(context, model.series.map((series, index) => ({
    label: series.title ?? `Series ${index + 1}`,
    swatch: (x: number, y: number): ChartMark => ({ kind: 'rect', x, y: y - 8, width: 8, height: 8, fill: context.color(series, index) }),
  })), 12));
  return marks;
}
