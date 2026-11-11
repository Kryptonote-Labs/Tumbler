import { chartShapeMarks } from './shape-scene.ts';
import { chartSeriesStroke, chartStrokeMark } from './stroke-scene.ts';
import { chartDataLabelMarks } from './label-scene.ts';
import { chartMarkerMarks } from './marker-scene.ts';
import { layoutCartesianChart } from './layout.ts';
import { indexChartSequence } from './indexed-data.ts';
import { chartTickLabel } from './tick-label.ts';
import { chartFont, chartStroke } from './scene-style.ts';
import { legendMarks, line, type ChartMark, type SceneContext } from './scene-marks.ts';

/** Radar axes share a numeric scale; missing values interrupt the series outline. */
export function radarScene(context: SceneContext): ChartMark[] {
  const { model, width, height, options } = context;
  const layout = layoutCartesianChart(model, width, height, context.measure);
  const axis = model.axes.find(axis => axis.kind === 'value');
  const categoryAxis = model.axes.find(axis => axis.kind === 'category');
  const radius = Math.max(1, Math.min(layout.plot.width, layout.plot.height) / 2 - 12);
  const cx = layout.plot.x + layout.plot.width / 2, cy = layout.plot.y + layout.plot.height / 2;
  const count = layout.categories.length;
  if (!count) return [];
  const point = (index: number, distance: number) => {
    const angle = index * Math.PI * 2 / count - Math.PI / 2;
    return { x: cx + Math.cos(angle) * distance, y: cy + Math.sin(angle) * distance };
  };
  const distance = (value: number) => (value - layout.minimum) / (layout.maximum - layout.minimum || 1) * radius;
  const path = (points: readonly { x: number; y: number }[], close = true) => points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') + (close ? ' Z' : '');
  const marks: ChartMark[] = chartShapeMarks(context, layout.plot, model.plotArea);
  const grid = chartStroke('gridline', axis?.gridlineStyle, model, options.resolveColor);
  const stroke = chartStroke('axis', categoryAxis?.lineStyle, model, options.resolveColor);
  if (!axis?.deleted) {
    const font = chartFont('tick', axis?.textStyle, model, options.resolveColor);
    for (const tick of layout.ticks) {
      const r = distance(tick);
      if (r < 0) continue;
      if (axis?.majorGridlines && grid.stroke) marks.push({ kind: 'path', d: path(Array.from({ length: count }, (_, index) => point(index, r))), ...chartStrokeMark(grid) });
      marks.push({ kind: 'text', text: chartTickLabel(tick, axis?.numberFormatCode, options), x: cx + 4, y: cy - r - 3, anchor: 'start', font });
    }
  }
  const categoryFont = chartFont('category', categoryAxis?.textStyle, model, options.resolveColor);
  layout.categories.forEach((text, index) => {
    const end = point(index, radius);
    if (!categoryAxis?.deleted) {
      marks.push(...line(cx, cy, end.x, end.y, stroke));
      const label = point(index, radius + categoryFont.size);
      marks.push({ kind: 'text', text, x: label.x, y: label.y + categoryFont.size / 3, anchor: label.x < cx - 1 ? 'end' : label.x > cx + 1 ? 'start' : 'middle', font: categoryFont });
    }
  });
  model.series.forEach((series, seriesIndex) => {
    const values = indexChartSequence(series.values);
    const points = Array.from({ length: count }, (_, index) => {
      const value = values.get(index);
      return typeof value === 'number' ? point(index, distance(value)) : undefined;
    });
    const stroke = chartStrokeMark(chartSeriesStroke(context, series, seriesIndex));
    if (model.radarStyle === 'filled' && points.every(point => point !== undefined)) {
      marks.push({ kind: 'path', d: path(points), fill: series.noFill ? 'none' : context.color(series, seriesIndex), ...stroke });
    } else {
      // Rotate to the first gap, so the wraparound edge remains connected when appropriate.
      const gap = points.findIndex(point => point === undefined);
      const ordered = gap < 0 ? points : [...points.slice(gap), ...points.slice(0, gap)];
      let d = '', previous = false;
      for (const point of ordered) {
        if (point) { d += `${previous ? ' L' : ' M'} ${point.x} ${point.y}`; previous = true; }
        else previous = false;
      }
      if (gap < 0) d += ' Z';
      marks.push({ kind: 'path', d: d.trim(), ...stroke });
    }
    points.forEach((point, index) => {
      const value = values.get(index);
      if (point && typeof value === 'number') marks.push(...chartDataLabelMarks(context, series, seriesIndex, { index, ...point, category: layout.categories[index] ?? String(index + 1), value }));
    });
    if (model.radarStyle === 'marker' && series.marker?.symbol !== 'none') for (const [index, point] of points.entries()) {
      if (point) marks.push(...chartMarkerMarks(context, series, seriesIndex, index, point.x, point.y));
    }
  });
  if (model.legend) marks.push(...legendMarks(context, model.series.map((series, index) => ({ label: series.title ?? `Series ${index + 1}`, swatch: (x: number, y: number): ChartMark => ({ kind: 'rect', x, y: y - 7, width: 8, height: 8, fill: context.color(series, index) }) })), 12));
  return marks;
}
