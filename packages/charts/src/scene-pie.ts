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
import { indexChartSequence } from './indexed-data.ts';
import { layoutPieSlices, pieArcPath, type ChartRect, type PieSlice } from "./layout.ts";
import { chartPieData } from './pie-data.ts';
import { pie3DScene } from './scene-pie-3d.ts';
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
export function pieScene(context: SceneContext, labels?: { readonly fractions?: ReadonlyMap<number, number>; readonly slices?: readonly PieSlice[]; readonly categories?: ReadonlyMap<number, string>; readonly frame?: ChartRect; readonly layers?: { readonly leaders: ChartMark[]; readonly labels: ChartMark[] } }): ChartMark[] {
  const { model } = context;
  const plot = labels?.frame ?? pieChartFrame(context).plot;
  if (model.threeD) return [...pie3DScene(context, plot), ...chartLegendScene(context)];
  const left = plot.x, right = left + plot.width, top = plot.y, bottom = top + plot.height;
  const radius = Math.max(1, Math.min((right - left) / 2, (bottom - top) / 2));
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  const hole = model.kind === "doughnut" ? radius * (model.holeSize ?? 50) / 100 : 0;
  const first = model.series[0];
  if (!first) return [];
  const marks: ChartMark[] = chartShapeMarks(context, { x: left, y: top, width: right - left, height: bottom - top }, model.plotArea);
  const dataLabels: ChartMark[] = labels?.layers?.labels ?? [];
  const leaders: ChartMark[] = labels?.layers?.leaders ?? [];
  const rings = model.kind === 'doughnut' ? model.series : model.series.slice(0, 1);
  rings.forEach((series, ring) => {
    const outer = radius - (radius - hole) * (rings.length - ring - 1) / rings.length;
    const inner = model.kind === 'doughnut' ? radius - (radius - hole) * (rings.length - ring) / rings.length : 0;
    const current = labels?.slices ?? layoutPieSlices({ ...model, series: [series] });
    const fractions = labels?.fractions ?? chartPieData(series).fractions;
    const offset = (slice: { startAngle: number; endAngle: number; index: number }) => {
      const explosion = context.pointFormat(series, slice.index)?.explosion ?? series.explosion ?? 0;
      const angle = (slice.startAngle + slice.endAngle) / 2;
      return { dx: Math.cos(angle) * radius * explosion / 100, dy: Math.sin(angle) * radius * explosion / 100 };
    };
    const categories = indexChartSequence(series.categories);
    current.forEach((slice, index) => {
      const { dx, dy } = offset(slice);
      const d = pieArcPath(cx + dx, cy + dy, outer, slice.startAngle, slice.endAngle, inner);
      const paint = chartPointFill(context, series, slice.index, { x: cx + dx - outer, y: cy + dy - outer, width: outer * 2, height: outer * 2 });
      const fill = paint.fillPicture ? { ...paint, fillPicture: { ...paint.fillPicture, bounds: pieFillBounds(cx + dx, cy + dy, outer, inner, slice.startAngle, slice.endAngle) } } : paint;
      marks.push({ kind: 'path', d, fill: chartPointColor(context, series, ring, slice.index), ...fill, ...chartPointStroke(context, series, ring, slice.index, '#ffffff') });
      const angle = (slice.startAngle + slice.endAngle) / 2;
      const labelRadius = inner + (outer - inner) * .65;
      const category = labels?.categories?.get(slice.index) ?? String(categories.get(slice.index) ?? slice.index + 1);
      dataLabels.push(...chartDataLabelMarks(context, series, ring, { index: slice.index,
        x: cx + dx + Math.cos(angle) * labelRadius, y: cy + dy + Math.sin(angle) * labelRadius,
        pie: { cx: cx + dx, cy: cy + dy, inner, outer, startAngle: slice.startAngle, endAngle: slice.endAngle, tilt: 1 },
        category, value: slice.value, percent: fractions.get(slice.index) ?? 0 }, leaders));
    });
  });
  const annotations = labels?.layers ? [] : leaders.concat(dataLabels);
  return marks.concat(annotations, chartLegendScene(context));
}
