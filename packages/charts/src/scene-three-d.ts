import { layoutBarBand } from './bar-layout.ts';
import { layoutCartesianChart } from './layout.ts';
import { chartFont } from './scene-style.ts';
import { chartTickLabel } from './tick-label.ts';
import { chartPolygon, chartProjection, chartShade, type ChartPoint3D } from './projection.ts';
import { legendMarks, type ChartMark, type SceneContext } from './scene-marks.ts';

/** Cartesian 3D plots use one camera for data, walls, gridlines and labels. */
export function threeDScene(context: SceneContext): ChartMark[] {
  const { model, width, height, options } = context;
  const layout = layoutCartesianChart(model, width, height, context.measure);
  const project = chartProjection(model, layout.plot);
  const vertical = (value: number) => (value - layout.minimum) / (layout.maximum - layout.minimum || 1);
  const horizontal = model.kind === 'bar';
  const point = (category: number, value: number, depth: number): ChartPoint3D => horizontal ? { x: vertical(value), y: category, z: depth } : { x: category, y: vertical(value), z: depth };
  const polygons: { depth: number; mark: ChartMark }[] = [];
  function face(vertices: readonly ChartPoint3D[], fill: string, stroke?: string) {
    const points = vertices.map(project);
    polygons.push({ depth: points.reduce((total, point) => total + point.depth, 0) / points.length,
      mark: { kind: 'path', d: chartPolygon(points), fill, ...(stroke ? { stroke, strokeWidth: 0.5 } : {}) } });
  }
  face([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }], '#f2f2f2');
  face([{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, { x: 1, y: 1, z: 1 }, { x: 0, y: 1, z: 1 }], '#f7f7f7');
  const marks: ChartMark[] = [];
  const font = chartFont('tick', model.axes.find(axis => axis.kind === 'value')?.textStyle, model, options.resolveColor);
  for (const tick of layout.ticks) {
    const a = project(point(0, tick, 1)), b = project(point(1, tick, 1));
    marks.push({ kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#d9d9d9', width: 1 });
    marks.push({ kind: 'text', text: chartTickLabel(tick, model.axes.find(axis => axis.kind === 'value')?.numberFormatCode, options), x: a.x - 5, y: a.y + 4, anchor: 'end', font });
  }
  const count = Math.max(1, layout.categories.length), seriesCount = Math.max(1, model.series.length);
  const band = layoutBarBand(model, 1 / count);
  model.series.forEach((series, seriesIndex) => {
    const fill = context.color(series, seriesIndex);
    const z0 = seriesIndex / seriesCount, z1 = (seriesIndex + 0.65) / seriesCount;
    const positions = layout.stacks[seriesIndex] ?? [];
    if (model.kind === 'area' || model.kind === 'line') {
      for (let category = 0; category < count - 1; category++) {
        const a = positions[category], b = positions[category + 1];
        if (!a || !b) continue;
        const x0 = category / Math.max(1, count - 1), x1 = (category + 1) / Math.max(1, count - 1);
        if (model.kind === 'area') face([point(x0, a.start, z0), point(x0, a.end, z0), point(x1, b.end, z0), point(x1, b.start, z0)], fill);
        face([point(x0, a.end, z0), point(x1, b.end, z0), point(x1, b.end, z1), point(x0, a.end, z1)], chartShade(fill, 1.1));
      }
      return;
    }
    positions.forEach((value, category) => {
      if (!value) return;
      const start = category / count + band.inset + (model.grouping === 'standard' ? 0 : seriesIndex * band.stride);
      const end = start + band.thickness;
      const corners = [point(start, value.start, z0), point(end, value.start, z0), point(end, value.end, z0), point(start, value.end, z0), point(start, value.start, z1), point(end, value.start, z1), point(end, value.end, z1), point(start, value.end, z1)];
      const faces = [[0, 1, 2, 3], [1, 5, 6, 2], [4, 0, 3, 7], [3, 2, 6, 7], [4, 5, 1, 0], [5, 4, 7, 6]];
      faces.forEach((indices, faceIndex) => face(indices.map(index => corners[index]!), chartShade(fill, [1, 0.8, 0.9, 1.15, 0.65, 0.85][faceIndex]!)));
    });
  });
  const ordered = polygons.sort((a, b) => b.depth - a.depth).map(polygon => polygon.mark);
  layout.categories.forEach((text, index) => {
    const p = project(point((index + 0.5) / count, layout.minimum, 0));
    marks.push({ kind: 'text', text, x: p.x, y: p.y + font.size + 6, anchor: 'middle', font });
  });
  if (model.legend) marks.push(...legendMarks(context, model.series.map((series, index) => ({ label: series.title ?? `Series ${index + 1}`, swatch: (x: number, y: number): ChartMark => ({ kind: 'rect', x, y: y - 7, width: 8, height: 8, fill: context.color(series, index) }) })), 12));
  return [...ordered, ...marks];
}
