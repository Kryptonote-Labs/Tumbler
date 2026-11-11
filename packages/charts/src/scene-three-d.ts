import { threeDAxisMarks } from './three-d-axes.ts';
import { chartAreaMesh } from './area-mesh.ts';
import { chartMeshOutline } from './mesh-outlines.ts';
import { chartPointStroke } from './stroke-scene.ts';
import { threeDWallMarks } from './three-d-walls.ts';
import { chartLegendFill } from './fill-scene.ts';
import { chartBarMesh } from './bar-mesh.ts';
import { threeDGeometry } from './three-d-geometry.ts';
import { threeDPointPaint } from './three-d-paint.ts';
import { chartFaceCollector, chartProjectedBounds } from './three-d-faces.ts';
import { chartShapeMarks } from './shape-scene.ts';
import { chartDataLabelMarks } from './label-scene.ts';
import { indexChartSequence } from './indexed-data.ts';
import { layoutCartesianChart } from './layout.ts';
import { chart3DSize, chartProjection, type ChartPoint3D } from './projection.ts';
import { legendMarks, type ChartMark, type SceneContext } from './scene-marks.ts';

/** Cartesian 3D plots use one camera for data, walls, gridlines and labels. */
export function threeDScene(context: SceneContext): ChartMark[] {
  const { model, width, height, options } = context;
  const layout = layoutCartesianChart(model, width, height, context.measure), geometry = threeDGeometry(model, layout);
  const project = chartProjection(model, layout.plot), faces = chartFaceCollector(project);
  const physicalSize = chart3DSize(model, layout.plot);
  const backdrop = threeDWallMarks(context, layout.plot, project);
  const { point } = geometry;
  const axes = threeDAxisMarks(context, layout, geometry, project);
  const labels: ChartMark[] = [];
  model.series.forEach((series, seriesIndex) => {
    const depth = geometry.depthBand(seriesIndex), positions = layout.stacks[seriesIndex] ?? [];
    if (model.kind === 'area') {
      const mesh = chartAreaMesh(positions.map((value, index) => value ? { category: geometry.category(index, false), start: geometry.value(value.start), end: geometry.value(value.end) } : undefined), depth.start, depth.end);
      const bounds = chartProjectedBounds(mesh.flatMap(face => face.vertices).map(project));
      for (const face of mesh) {
        const { stroke, strokeWidth, strokeDash, strokeCap, strokeJoin, miterLimit, ...paint } = threeDPointPaint(context, series, seriesIndex, 0, face.vertices, bounds, false, physicalSize);
        faces.add(face.vertices, paint);
      }
      const outline = chartPointStroke(context, series, seriesIndex, 0);
      if (outline.stroke && (outline.strokeWidth ?? 0) > 0) for (const edge of chartMeshOutline(mesh, project)) faces.addMarks([{ kind: 'path', d: edge.d, ...outline }], edge.depth);
    } else if (model.kind === 'line') {
      const ribbons: ChartPoint3D[][] = [];
      for (let index = 0; index < geometry.count - 1; index++) {
        const a = positions[index], b = positions[index + 1];
        if (!a || !b) continue;
        const x0 = geometry.category(index, false), x1 = geometry.category(index + 1, false);
        ribbons.push([point(x0, a.end, depth.start), point(x0, a.end, depth.end), point(x1, b.end, depth.end), point(x1, b.end, depth.start)]);
      }
      const bounds = chartProjectedBounds(ribbons.flat().map(project));
      for (const vertices of ribbons) faces.add(vertices, threeDPointPaint(context, series, seriesIndex, 0, vertices, bounds, true, physicalSize), true, true);
    } else positions.forEach((value, category) => {
      if (!value || geometry.valueAxis?.logBase && value.end <= 0) return;
      if (Math.max(value.start, value.end) < layout.minimum || Math.min(value.start, value.end) > layout.maximum) return;
      const band = geometry.categoryBand(category, seriesIndex), shape = series.barShape ?? model.barShape ?? 'box';
      const zero = geometry.valueAxis?.logBase ? layout.minimum : 0;
      const base = geometry.value(value.start), end = geometry.value(value.end);
      const positive = value.end >= value.start;
      const stacked = model.grouping === 'stacked' || model.grouping === 'percent-stacked';
      const peak = shape.endsWith('ToMax') ? positive ? layout.maximum : layout.minimum : stacked ? (positive ? Math.max : Math.min)(zero, ...layout.stacks.flatMap(stack => stack[category] ? [stack[category]!.end] : [])) : value.end;
      const extent = Math.abs(peak - zero) || 1;
      const taper = shape.startsWith('cone') || shape.startsWith('pyramid');
      const mesh = chartBarMesh({ shape, horizontal: geometry.horizontal, categoryMinimum: band.start, categoryMaximum: band.end, depthMinimum: depth.start, depthMaximum: depth.end, valueStart: base, valueEnd: end,
        ...(taper ? { baseRadius: Math.max(0, 1 - Math.abs((geometry.valueAxis?.logBase ? Math.max(layout.minimum, value.start) : value.start) - zero) / extent), topRadius: Math.max(0, 1 - Math.abs(value.end - zero) / extent) } : {}) });
      const bounds = chartProjectedBounds(mesh.flatMap(face => face.vertices).map(project));
      for (const face of mesh) {
        const { stroke, strokeWidth, strokeDash, strokeCap, strokeJoin, miterLimit, ...paint } = threeDPointPaint(context, series, seriesIndex, category, face.vertices, bounds, false, physicalSize);
        faces.add(face.vertices, paint);
      }
      const outline = chartPointStroke(context, series, seriesIndex, category);
      if (outline.stroke && (outline.strokeWidth ?? 0) > 0) for (const edge of chartMeshOutline(mesh, project)) faces.addMarks([{ kind: 'path', d: edge.d, ...outline }], edge.depth);
    });
    const values = indexChartSequence(series.values);
    positions.forEach((value, index) => {
      const raw = values.get(index);
      if (!value || typeof raw !== 'number') return;
      const band = geometry.categoryBand(index, seriesIndex), across = model.kind === 'area' || model.kind === 'line' ? geometry.category(index, false) : (band.start + band.end) / 2;
      const end = project(point(across, value.end, (depth.start + depth.end) / 2)), base = project(point(across, value.start, (depth.start + depth.end) / 2));
      labels.push(...chartDataLabelMarks(context, series, seriesIndex, { index, x: end.x, y: end.y, baseX: base.x, baseY: base.y, category: layout.categories[index] ?? String(index + 1), value: raw }));
    });
  });
  if (model.legend) labels.push(...legendMarks(context, model.series.map((series, index) => ({ label: series.title ?? `Series ${index + 1}`, swatch: (x: number, y: number): ChartMark => ({ kind: 'rect', x, y: y - 7, width: 8, height: 8, ...chartLegendFill(context, series, { x, y: y - 7, width: 8, height: 8 }), fill: series.noFill ? 'none' : context.color(series, index) }) })), 12));
  return [...chartShapeMarks(context, layout.plot, model.plotArea), { kind: 'group', clip: layout.plot, marks: [...backdrop, ...axes.grids, ...faces.marks()] }, ...axes.marks, ...labels];
}
