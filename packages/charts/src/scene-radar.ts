import { chartLegendScene } from './legend-scene.ts';
import { chartFillPaint } from './fill-scene.ts';
import { chartShapeMarks } from './shape-scene.ts';
import { chartSeriesStroke, chartStrokeMark } from './stroke-scene.ts';
import { chartDataLabelMarks } from './label-scene.ts';
import { chartMarkerMarks } from './marker-scene.ts';
import { layoutCartesianChart, pieArcPath } from './layout.ts';
import { indexChartSequence } from './indexed-data.ts';
import { chartTickLabel } from './tick-label.ts';
import { chartMinorTicks } from './axis-scale.ts';
import { CHART_SCENE_CELL_LIMIT } from './scene-budget.ts';
import { chartFont, chartStroke } from './scene-style.ts';
import { line, type ChartMark, type SceneContext } from './scene-marks.ts';

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
  const stroke = chartStroke('axis', categoryAxis?.lineStyle, model, options.resolveColor);
  const font = chartFont('tick', axis?.textStyle, model, options.resolveColor);
  const majorGrid = axis?.majorGridlines ? chartStroke('gridline', axis.gridlineStyle, model, options.resolveColor) : undefined;
  const minorGrid = axis?.minorGridlines ? chartStroke('gridline', axis.minorGridlineStyle, model, options.resolveColor) : undefined;
  const minorTicks = axis && minorGrid?.stroke ? chartMinorTicks(layout.minimum, layout.maximum, axis, layout.ticks) : [];
  const circular = (r: number) => r * (1 - Math.cos(Math.PI / count)) <= .1;
  // Dense regular polygons differ from circles by less than a tenth of a CSS pixel.
  const gridWork = [...(majorGrid?.stroke ? layout.ticks : []), ...minorTicks].reduce((work, tick) => {
    const r = distance(tick);
    return work + (r <= 0 ? 0 : circular(r) ? 2 : count);
  }, 0);
  if (gridWork > CHART_SCENE_CELL_LIMIT * 5) throw new RangeError('Radar grid geometry exceeds the preview work budget.');
  const drawTick = (tick: number, minor: boolean) => {
    const r = distance(tick);
    if (r < 0) return;
    const grid = minor ? minorGrid : majorGrid;
    if (grid?.stroke && r > 0) {
      // Preserve the top category's dash origin when a dense polygon becomes two arcs.
      const d = circular(r) ? pieArcPath(cx, cy, r, -Math.PI / 2, Math.PI * 1.5)
        : path(Array.from({ length: count }, (_, index) => point(index, r)));
      marks.push({ kind: 'path', d, ...chartStrokeMark(grid) });
    }
    if (!minor && !axis?.deleted && axis?.tickLabelPosition !== 'none') marks.push({ kind: 'text', text: chartTickLabel(tick, axis?.numberFormatCode, options), x: cx + 4, y: cy - r - 3, anchor: 'start', font });
  };
  minorTicks.forEach(tick => drawTick(tick, true));
  layout.ticks.forEach(tick => drawTick(tick, false));
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
      marks.push({ kind: 'path', d: path(points), fill: series.noFill ? 'none' : context.color(series, seriesIndex), ...chartFillPaint(context, series, { x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2 }), ...stroke });
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
    if (model.radarStyle === 'marker') for (const [index, point] of points.entries()) {
      if (point) marks.push(...chartMarkerMarks(context, series, seriesIndex, index, point.x, point.y));
    }
  });
  marks.push(...chartLegendScene(context));
  return marks;
}
