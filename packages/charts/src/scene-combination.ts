import { chartLegendScene } from './legend-scene.ts';
import { stockScene } from './scene-stock.ts';
import { layoutCombinationChart } from './combination.ts';
import { cartesianScene } from './scene-cartesian.ts';
import { type ChartMark, type SceneContext } from './scene-marks.ts';

/** Each plot uses the shared categorical renderer, retaining its own axes and analytical properties. */
export function combinationScene(context: SceneContext): ChartMark[] {
  const { model, width, height } = context;
  const plots = layoutCombinationChart(model, width, height, context.measure);
  const marks: ChartMark[] = [], seenAxes = new Set<number>(), seenTitles = new Set<number>();
  for (const [plotIndex, plot] of plots.entries()) {
    const { plotArea, ...plotModel } = plot.model;
    const axes = plot.model.axes.map(axis => {
      const current = { ...axis, deleted: axis.deleted || seenAxes.has(axis.id) };
      if (!seenTitles.has(axis.id)) return current;
      const { titleText: _text, titleShape: _shape, ...rest } = current;
      return { ...rest, title: undefined };
    });
    plot.model.axes.forEach(axis => { if (!axis.deleted) seenAxes.add(axis.id); });
    plot.model.axes.forEach(axis => { if (axis.title !== undefined) seenTitles.add(axis.id); });
    const current: SceneContext = {
      ...context,
      model: { ...plotModel, ...(plotIndex === 0 && plotArea ? { plotArea } : {}), title: undefined, legend: undefined, axes, ...(model.themeColors ? { themeColors: model.themeColors } : {}), ...(model.themeFonts ? { themeFonts: model.themeFonts } : {}) },
      color: (series, index, line) => context.color(series, Math.max(0, model.series.findIndex(item => item.index === series.index)), line),
    };
    marks.push(...(current.model.kind === 'stock' ? stockScene(current, plot.layout) : cartesianScene(current, true, plot.layout)));
  }
  marks.push(...chartLegendScene(context));
  return marks;
}
