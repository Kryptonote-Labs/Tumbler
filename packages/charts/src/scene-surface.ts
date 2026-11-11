import { indexChartSequence } from './indexed-data.ts';
import { chartValueCoordinate, layoutCartesianChart } from './layout.ts';
import { chartFont } from './scene-style.ts';
import { chartTickLabel } from './tick-label.ts';
import { chartPolygon, chartProjection, chartShade } from './projection.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';

interface SurfaceVertex { readonly x: number; readonly z: number; readonly value: number }
/** Clip a heightfield triangle against one contour plane, retaining interpolated boundaries. */
function clip(vertices: readonly SurfaceVertex[], level: number, above: boolean): SurfaceVertex[] {
  const output: SurfaceVertex[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!, b = vertices[(i + 1) % vertices.length]!;
    const insideA = above ? a.value >= level : a.value <= level;
    const insideB = above ? b.value >= level : b.value <= level;
    if (insideA) output.push(a);
    if (insideA !== insideB) {
      const fraction = (level - a.value) / (b.value - a.value);
      output.push({ x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction, value: level });
    }
  }
  return output;
}

/** Surface charts render height bands; the non-3D form is the contour projection. */
export function surfaceScene(context: SceneContext): ChartMark[] {
  const { model, width, height, options } = context;
  const layout = layoutCartesianChart(model, width, height, context.measure);
  const columns = layout.categories.length, rows = model.series.length;
  const values = model.series.map(series => indexChartSequence(series.values));
  const bands = [...new Set([layout.minimum, ...layout.ticks.filter(tick => tick > layout.minimum && tick < layout.maximum), layout.maximum])].sort((a, b) => a - b);
  let work = 0;
  const project = chartProjection(model, layout.plot);
  const position = (vertex: SurfaceVertex) => model.threeD
    ? project({ x: vertex.x, y: (vertex.value - layout.minimum) / (layout.maximum - layout.minimum || 1), z: vertex.z })
    : { x: layout.plot.x + vertex.x * layout.plot.width, y: layout.plot.y + (1 - vertex.z) * layout.plot.height, depth: vertex.z };
  const polygons: { depth: number; mark: ChartMark }[] = [];
  for (let row = 0; row < rows - 1; row++) for (let column = 0; column < columns - 1; column++) {
    const corners = [[column, row], [column + 1, row], [column + 1, row + 1], [column, row + 1]].map(([x, z]) => {
      const value = values[z!]?.get(x!);
      return typeof value === 'number' ? { x: x! / Math.max(1, columns - 1), z: z! / Math.max(1, rows - 1), value } : undefined;
    });
    if (!corners.every(point => point !== undefined)) continue;
    const triangles = [[corners[0]!, corners[1]!, corners[2]!], [corners[0]!, corners[2]!, corners[3]!]];
    for (const triangle of triangles) for (let band = 0; band < bands.length - 1; band++) {
      if (++work > 200_000 || polygons.length >= 100_000) throw new RangeError('Chart preview geometry budget exceeded.');
      const minimum = Math.min(...triangle.map(vertex => vertex.value)), maximum = Math.max(...triangle.map(vertex => vertex.value));
      if (bands[band + 1]! < minimum || bands[band]! > maximum) continue;
      const clipped = clip(clip(triangle, bands[band]!, true), bands[band + 1]!, false);
      if (clipped.length < 3) continue;
      const points = clipped.map(position);
      const fill = context.color(model.series[0]!, band);
      polygons.push({ depth: points.reduce((sum, point) => sum + point.depth, 0) / points.length, mark: { kind: 'path', d: chartPolygon(points), ...(model.wireframe ? {} : { fill }), stroke: model.wireframe ? fill : chartShade(fill, 0.85), strokeWidth: model.wireframe ? 1 : 0.3 } });
    }
  }
  const marks = polygons.sort((a, b) => b.depth - a.depth).map(polygon => polygon.mark);
  const font = chartFont('category', undefined, model, options.resolveColor);
  layout.categories.forEach((text, index) => {
    const point = position({ x: index / Math.max(1, columns - 1), z: 0, value: layout.minimum });
    marks.push({ kind: 'text', text, x: point.x, y: point.y + font.size + 5, anchor: 'middle', font });
  });
  model.series.forEach((series, index) => {
    const point = position({ x: 0, z: index / Math.max(1, rows - 1), value: layout.minimum });
    marks.push({ kind: 'text', text: series.title ?? `Series ${index + 1}`, x: point.x - 5, y: point.y + 4, anchor: 'end', font });
  });
  if (model.threeD) for (const value of layout.ticks) {
    const point = project({ x: 0, y: (value - layout.minimum) / (layout.maximum - layout.minimum || 1), z: 1 });
    marks.push({ kind: 'text', text: chartTickLabel(value, model.axes.find(axis => axis.kind === 'value')?.numberFormatCode, options), x: point.x - 5, y: point.y + 4, anchor: 'end', font });
  }
  return marks;
}
