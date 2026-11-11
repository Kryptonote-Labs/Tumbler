import { mergeChartFillLayers } from './fill-style.ts';
import { cartesianScene } from './scene-cartesian.ts';
import { cartesianGeometry } from './cartesian-geometry.ts';
import { cartesianDecorationMarks } from './plot-decorations.ts';
import { chartMarkerMarks } from './marker-scene.ts';
import { chartDataLabelMarks } from './label-scene.ts';
import { indexChartSequence } from './indexed-data.ts';
import { layoutCartesianChart, type CartesianChartLayout } from './layout.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';

/** Stock prices retain their source markers and shared date/value axis geometry. */
export function stockScene(context: SceneContext, suppliedLayout?: CartesianChartLayout): ChartMark[] {
  const { model, width, height } = context;
  const layout = suppliedLayout ?? layoutCartesianChart(model, width, height, context.measure);
  const marks = cartesianScene(context, false, layout), geometry = cartesianGeometry(model, layout);
  const data: ChartMark[] = cartesianDecorationMarks(context, layout), labels: ChartMark[] = [];
  model.series.forEach((source, seriesIndex) => {
    const series = source.marker ? source : { ...source, marker: { symbol: model.series.length === 3 && seriesIndex === 2 ? 'dash' as const : 'none' as const } };
    const values = indexChartSequence(series.values);
    layout.categories.forEach((category, index) => {
      const value = values.get(index);
      if (typeof value !== 'number' || geometry.valueAxis?.logBase && value <= 0) return;
      const x = geometry.category(index), y = geometry.value(value);
      const marker = mergeChartFillLayers([series.marker, context.pointFormat(series, index)?.marker]);
      const markerMarks = chartMarkerMarks(context, series, seriesIndex, index, x, y);
      // A stock close dash starts at the price stem; ordinary line markers are centered.
      const close = model.series.length === 3 && seriesIndex === 2 && marker?.symbol === 'dash';
      const length = marker?.size === undefined ? geometry.band / 5 : marker.size * 4 / 3;
      data.push(...markerMarks.map(mark => close && mark.kind === 'path' ? { ...mark, d: `M ${x} ${y} L ${x + length} ${y}` } : mark));
      labels.push(...chartDataLabelMarks(context, series, seriesIndex, { index, x, y, category, value }));
    });
  });
  marks.push({ kind: 'group', clip: layout.plot, marks: data }, ...labels);
  return marks;
}
