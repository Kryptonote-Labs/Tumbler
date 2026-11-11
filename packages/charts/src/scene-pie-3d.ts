import { pieProjection } from './pie-projection.ts';
import { chartDataLabelMarks } from './label-scene.ts';
import { chartShapeMarks } from './shape-scene.ts';
import { chartPointFill } from './fill-scene.ts';
import { chartPointStroke } from './stroke-scene.ts';
import { chartPointColor } from './point-style.ts';
import { chartPolygon, chartShade } from './projection.ts';
import { layoutPieSlices, type ChartRect } from './layout.ts';
import { chartPieData } from './pie-data.ts';
import { indexChartSequence } from './indexed-data.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';

/** A single camera projects slice faces, extrusion, explosion and label anchors. */
export function pie3DScene(context: SceneContext, plot: ChartRect): ChartMark[] {
  const { model } = context, series = model.series[0];
  if (!series || !model.threeD) return [];
  const slices = layoutPieSlices(model), categories = indexChartSequence(series.categories);
  const fractions = chartPieData(series).fractions;
  const geometry = slices.map(slice => {
    const angle = (slice.startAngle + slice.endAngle) / 2;
    const explosion = context.pointFormat(series, slice.index)?.explosion ?? series.explosion ?? 0;
    const dx = Math.cos(angle) * .5 * explosion / 100, dy = Math.sin(angle) * .5 * explosion / 100;
    const steps = Math.max(1, Math.ceil((slice.endAngle - slice.startAngle) * 32));
    const angles = Array.from({ length: steps + 1 }, (_, i) => slice.startAngle + (slice.endAngle - slice.startAngle) * i / steps);
    return { slice, angle, dx, dy, steps, angles };
  });
  const footprint = geometry.flatMap(({ dx, dy }) => [-.5, .5].flatMap(x => [-.5, .5].map(y => ({ x: dx + x, y: dy + y }))));
  const projection = pieProjection(model.threeD, plot, footprint);
  const fillFrames = new Map<string, ChartRect>();
  const sides: ChartMark[] = [], faces: ChartMark[] = [], leaders: ChartMark[] = [], labels: ChartMark[] = [];
  for (const { slice, angle, dx, dy, steps, angles } of geometry) {
    const at = (angle: number, z = .05) => projection.project(dx + Math.cos(angle) * .5, dy + Math.sin(angle) * .5, z);
    const color = chartPointColor(context, series, 0, slice.index);
    for (let i = 0; i < steps; i++) {
      const a = angles[i]!, b = angles[i + 1]!;
      if (Math.sin((a + b) / 2) < 0) continue;
      sides.push({ kind: 'path', d: chartPolygon([at(a), at(b), at(b, -.05), at(a, -.05)]), fill: chartShade(color, .75) });
    }
    const center = projection.project(dx, dy), points = [...angles.map(value => at(value)), center];
    const x = Math.min(...points.map(point => point.x)), y = Math.min(...points.map(point => point.y));
    const bounds = { x, y, width: Math.max(...points.map(point => point.x)) - x, height: Math.max(...points.map(point => point.y)) - y };
    const key = `${dx},${dy}`;
    let frame = fillFrames.get(key);
    if (!frame) {
      const circle = Array.from({ length: 201 }, (_, i) => at(i * Math.PI / 100));
      const left = Math.min(...circle.map(point => point.x)), top = Math.min(...circle.map(point => point.y));
      frame = { x: left, y: top, width: Math.max(...circle.map(point => point.x)) - left, height: Math.max(...circle.map(point => point.y)) - top };
      fillFrames.set(key, frame);
    }
    const paint = chartPointFill(context, series, slice.index, frame);
    const fill = paint.fillPicture ? { ...paint, fillPicture: { ...paint.fillPicture, bounds } } : paint;
    faces.push({ kind: 'path', d: chartPolygon(points), fill: color, ...fill, ...chartPointStroke(context, series, 0, slice.index, '#ffffff') });
    labels.push(...chartDataLabelMarks(context, series, 0, {
      index: slice.index, ...projection.project(dx + Math.cos(angle) * .25, dy + Math.sin(angle) * .25),
      pie: { cx: dx, cy: dy, inner: 0, outer: .5, tilt: 1, startAngle: slice.startAngle, endAngle: slice.endAngle, projection },
      category: String(categories.get(slice.index) ?? slice.index + 1), value: slice.value, percent: fractions.get(slice.index) ?? 0,
    }, leaders));
  }
  return [...chartShapeMarks(context, plot, model.plotArea), ...sides, ...faces, ...leaders, ...labels];
}
