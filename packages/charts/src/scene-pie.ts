import { chartLegendScene } from './legend-scene.ts';
import { layoutChartLegend } from './legend-layout.ts';
import { chartTitleHeight } from './title-scene.ts';
import { chartManualPlot } from './manual-layout.ts';
import { chartPointFill } from './fill-scene.ts';
import { pieFillBounds } from './pie-fill-bounds.ts';
import { chartShapeMarks } from './shape-scene.ts';
import { chartPointStroke } from './stroke-scene.ts';
import { chartDataLabelMarks } from './label-scene.ts';
import { chartPointColor } from './point-style.ts';
import { chartShade, chartPolygon } from './projection.ts';
import { indexChartSequence } from './indexed-data.ts';
import { layoutPieSlices, pieArcPath, type PieSlice } from "./layout.ts";
import { chartPieData } from './pie-data.ts';
import { type ChartMark, type SceneContext } from "./scene-marks.ts";

const PADDING = 16;

/** Shared chart-local data frame for pie, doughnut and split-pie plots. */
export function pieChartFrame(context: SceneContext) {
  const { model, width, height } = context;
  const legend = layoutChartLegend(model, width, height, context.measure, undefined, context.options.resolveColor);
  const leftSpace = legend.space.left, rightSpace = legend.space.right;
  const left = PADDING + leftSpace;
  const right = width - PADDING - rightSpace;
  const top = (model.title === undefined || model.titleOverlay ? PADDING : model.titleStyle?.rotation ? chartTitleHeight(model, context.measure) + 28 : 36) + legend.space.top;
  const bottom = height - PADDING - legend.space.bottom;
  const automatic = { x: left, y: top, width: right - left, height: bottom - top };
  return { plot: chartManualPlot(model.plotLayout, automatic, automatic, width, height) };
}

/** Pie and doughnut charts. The legend lists categories of the first series, one entry per slice. */
export function pieScene(context: SceneContext, labels?: { readonly fractions?: ReadonlyMap<number, number>; readonly slices?: readonly PieSlice[] }): ChartMark[] {
  const { model, width, height, options } = context;
  const { plot } = pieChartFrame(context);
  const left = plot.x, right = left + plot.width, top = plot.y, bottom = top + plot.height;
  const tilt = model.threeD ? Math.sin(Math.abs(model.threeD.rotationX) * Math.PI / 180) : 1;
  const available = Math.max(1, bottom - top);
  const initialRadius = Math.max(1, Math.min((right - left) / 2, available / (2 * tilt)));
  const depth = model.threeD ? Math.min(24, initialRadius * 0.2) * (model.threeD.heightPercent ?? 100) / 100 : 0;
  const cx = (left + right) / 2, cy = (top + bottom - depth) / 2;
  const radius = Math.max(1, Math.min((right - left) / 2, (available - depth) / (2 * tilt)));
  const hole = model.kind === "doughnut" ? radius * (model.holeSize ?? 50) / 100 : 0;
  const first = model.series[0];
  if (!first) return [];
  const marks: ChartMark[] = chartShapeMarks(context, { x: left, y: top, width: right - left, height: bottom - top }, model.plotArea);
  const rings = model.kind === 'doughnut' ? model.series : model.series.slice(0, 1);
  rings.forEach((series, ring) => {
    const outer = radius - (radius - hole) * (rings.length - ring - 1) / rings.length;
    const inner = model.kind === 'doughnut' ? radius - (radius - hole) * (rings.length - ring) / rings.length : 0;
    const current = labels?.slices ?? layoutPieSlices({ ...model, series: [series] });
    const fractions = labels?.fractions ?? chartPieData(series).fractions;
    const offset = (slice: { startAngle: number; endAngle: number; index: number }) => {
      const explosion = context.pointFormat(series, slice.index)?.explosion ?? series.explosion ?? 0;
      const angle = (slice.startAngle + slice.endAngle) / 2;
      return { dx: Math.cos(angle) * radius * explosion / 100, dy: Math.sin(angle) * radius * explosion / 100 * tilt };
    };
    const sample = (r: number, start: number, end: number) => {
      const steps = Math.max(1, Math.ceil(Math.abs(end - start) * 32));
      return Array.from({ length: steps + 1 }, (_, i) => { const angle = start + (end - start) * i / steps; return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r * tilt }; });
    };
    if (depth) for (const [index, slice] of current.entries()) {
      const { dx, dy } = offset(slice);
      const points = sample(outer, slice.startAngle, slice.endAngle).map(point => ({ x: point.x + dx, y: point.y + dy }));
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]!, b = points[i + 1]!;
        const middleAngle = slice.startAngle + (slice.endAngle - slice.startAngle) * (i + .5) / (points.length - 1);
        if (Math.sin(middleAngle) < 0) continue;
        marks.push({ kind: 'path', d: chartPolygon([a, b, { x: b.x, y: b.y + depth }, { x: a.x, y: a.y + depth }]), fill: chartShade(chartPointColor(context, series, ring, slice.index), 0.75) });
      }
    }
    const categories = indexChartSequence(series.categories);
    current.forEach((slice, index) => {
      const { dx, dy } = offset(slice);
      const shifted = (points: readonly { x: number; y: number }[]) => points.map(point => ({ x: point.x + dx, y: point.y + dy }));
      const d = depth ? chartPolygon(shifted([...sample(outer, slice.startAngle, slice.endAngle), ...(inner ? sample(inner, slice.endAngle, slice.startAngle) : [{ x: cx, y: cy }])])) : pieArcPath(cx + dx, cy + dy, outer, slice.startAngle, slice.endAngle, inner);
      const paint = chartPointFill(context, series, slice.index, { x: cx + dx - outer, y: cy + dy - outer * tilt, width: outer * 2, height: outer * tilt * 2 });
      const fill = paint.fillPicture ? { ...paint, fillPicture: { ...paint.fillPicture, bounds: pieFillBounds(cx + dx, cy + dy, outer, inner, slice.startAngle, slice.endAngle, tilt) } } : paint;
      marks.push({ kind: 'path', d, fill: chartPointColor(context, series, ring, slice.index), ...fill, ...chartPointStroke(context, series, ring, slice.index, '#ffffff') });
      const angle = (slice.startAngle + slice.endAngle) / 2;
      const labelRadius = inner + (outer - inner) * .65;
      const category = String(categories.get(slice.index) ?? slice.index + 1);
      marks.push(...chartDataLabelMarks(context, series, ring, { index: slice.index,
        x: cx + dx + Math.cos(angle) * labelRadius, y: cy + dy + Math.sin(angle) * labelRadius * tilt,
        category, value: slice.value, percent: fractions.get(slice.index) ?? 0 }));
    });
  });
  marks.push(...chartLegendScene(context));
  return marks;
}
