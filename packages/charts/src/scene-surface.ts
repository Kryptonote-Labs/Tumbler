import { chartSurfaceLevels } from './legend-items.ts';
import { chartAxisTitleFrame, chartContourAxisTitles } from './axis-title-scene.ts';
import { chartLegendScene } from './legend-scene.ts';
import { threeDWallMarks } from './three-d-walls.ts';
import { threeDAxisMarks } from './three-d-axes.ts';
import { threeDGeometry } from './three-d-geometry.ts';
import { surfaceWireframe, type SurfaceVertex } from './surface-wireframe.ts';
import { surfaceBandPaint } from './surface-bands.ts';
import { chartShapeMarks } from './shape-scene.ts';
import { chartAxisCoordinate } from './axis-scale.ts';
import { indexChartSequence } from './indexed-data.ts';
import { layoutCartesianChart } from './layout.ts';
import { chartFont } from './scene-style.ts';
import { chartTickLabel } from './tick-label.ts';
import { chartPolygon, chartProjection } from './projection.ts';
import { type ChartMark, type SceneContext } from './scene-marks.ts';

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
  const layout = layoutCartesianChart(model, width, height, context.measure, options);
  const columns = layout.categories.length, rows = model.series.length;
  const categoryAxis = model.axes.find(axis => axis.kind === 'category'), valueAxis = model.axes.find(axis => axis.kind === 'value'), seriesAxis = model.axes.find(axis => axis.kind === 'series');
  const formats = new Map(model.bandFormats?.map(band => [band.index, band.style]));
  const values = model.series.map(series => indexChartSequence(series.values));
  const bands = chartSurfaceLevels(layout);
  let work = 0;
  const spend = () => { if (++work > 200_000) throw new RangeError('Chart preview geometry budget exceeded.'); };
  const project = chartProjection(model, layout.plot);
  const geometry = threeDGeometry(model, layout);
  const axesContext = context.axisTitleFrame ? { ...context, axisTitleFrame: chartAxisTitleFrame(context, bands) } : context;
  const axes = model.threeD ? threeDAxisMarks(axesContext, layout, geometry, project) : undefined;
  const normalizedValue = (value: number) => chartAxisCoordinate(value, layout.minimum, layout.maximum, 0, 1, valueAxis);
  const position = (vertex: SurfaceVertex) => {
    const x = categoryAxis?.reversed ? 1 - vertex.x : vertex.x, z = seriesAxis?.reversed ? 1 - vertex.z : vertex.z;
    return model.threeD ? project({ x, y: normalizedValue(vertex.value), z })
      : { x: layout.plot.x + x * layout.plot.width, y: layout.plot.y + (1 - z) * layout.plot.height, depth: z };
  };
  const polygons: { depth: number; mark: ChartMark }[] = [];
  const seenEdges = new Set<string>();
  for (let row = 0; row < rows - 1; row++) for (let column = 0; column < columns - 1; column++) {
    const corners = [[column, row], [column + 1, row], [column + 1, row + 1], [column, row + 1]].map(([x, z]) => {
      const value = values[z!]?.get(x!);
      return typeof value === 'number' ? { x: x! / Math.max(1, columns - 1), z: z! / Math.max(1, rows - 1), value } : undefined;
    });
    if (!corners.every(point => point !== undefined)) continue;
    if (model.wireframe) {
      surfaceWireframe(corners, bands, model.sourceType === 'surface3DChart', seenEdges, (a, b, band) => {
        spend();
        const first = position(a), last = position(b);
        polygons.push({ depth: (first.depth + last.depth) / 2, mark: { kind: 'path', d: `M ${first.x} ${first.y} L ${last.x} ${last.y}`, ...surfaceBandPaint(context, band, formats.get(band), layout.plot) } });
      }, spend);
      continue;
    }
    const triangles = [[corners[0]!, corners[1]!, corners[2]!], [corners[0]!, corners[2]!, corners[3]!]];
    for (const triangle of triangles) for (let band = 0; band < bands.length - 1; band++) {
      if (++work > 200_000 || polygons.length >= 100_000) throw new RangeError('Chart preview geometry budget exceeded.');
      const minimum = Math.min(...triangle.map(vertex => vertex.value)), maximum = Math.max(...triangle.map(vertex => vertex.value));
      if (bands[band + 1]! < minimum || bands[band]! > maximum) continue;
      const clipped = clip(clip(triangle, bands[band]!, true), bands[band + 1]!, false);
      if (clipped.length < 3) continue;
      const points = clipped.map(position);
      polygons.push({ depth: points.reduce((sum, point) => sum + point.depth, 0) / points.length, mark: { kind: 'path', d: chartPolygon(points), ...surfaceBandPaint(context, band, formats.get(band), layout.plot) } });
    }
  }
  const marks: ChartMark[] = [...chartShapeMarks(context, layout.plot, model.plotArea), { kind: 'group', clip: layout.plot, marks: [...(model.threeD ? threeDWallMarks(context, layout.plot, project) : []), ...(axes?.grids ?? []), ...polygons.sort((a, b) => b.depth - a.depth).map(polygon => polygon.mark)] }];
  if (axes) marks.push(...axes.marks);
  else marks.push(...chartContourAxisTitles(axesContext, layout.plot));
  const font = chartFont('category', categoryAxis?.textStyle, model, options.resolveColor);
  const seriesFont = chartFont('category', seriesAxis?.textStyle, model, options.resolveColor);
  const valueFont = chartFont('tick', valueAxis?.textStyle, model, options.resolveColor);
  if (!axes && !categoryAxis?.deleted && categoryAxis?.tickLabelPosition !== 'none') layout.categories.forEach((text, index) => {
    const point = position({ x: index / Math.max(1, columns - 1), z: 0, value: layout.minimum });
    marks.push({ kind: 'text', text, x: point.x, y: point.y + font.size + 5, anchor: 'middle', font });
  });
  if (!axes && !seriesAxis?.deleted && seriesAxis?.tickLabelPosition !== 'none') model.series.forEach((series, index) => {
    const point = position({ x: 0, z: index / Math.max(1, rows - 1), value: layout.minimum });
    marks.push({ kind: 'text', text: series.title ?? `Series ${index + 1}`, x: point.x - 5, y: point.y + 4, anchor: 'end', font: seriesFont });
  });
  if (!axes && model.threeD && !valueAxis?.deleted && valueAxis?.tickLabelPosition !== 'none') for (const value of layout.ticks) {
    const point = project({ x: 0, y: normalizedValue(value), z: 1 });
    marks.push({ kind: 'text', text: chartTickLabel(value, valueAxis?.numberFormatCode, options), x: point.x - 5, y: point.y + 4, anchor: 'end', font: valueFont });
  }
  marks.push(...chartLegendScene(context, bands));
  return marks;
}
