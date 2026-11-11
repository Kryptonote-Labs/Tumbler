import { cartesianAnalyticalData } from './analytics-bounds.ts';
import { cartesianGeometry } from './cartesian-geometry.ts';
import { cartesianAxisMarks } from './axis-scene.ts';
import { chartAnalyticsMarks } from './analytics-scene.ts';
import { indexChartSequence } from './indexed-data.ts';
import { chartDataLabelMarks } from './label-scene.ts';
import { chartMarkerMarks } from './marker-scene.ts';
import { chartPointColor } from './point-style.ts';
import { layoutBarBand } from "./bar-layout.ts";
import { layoutCartesianChart, scatterLinePath } from "./layout.ts";
import { legendMarks, type ChartMark, type SceneContext } from "./scene-marks.ts";

/** Bar, column and line charts over shared categories. */
export function cartesianScene(context: SceneContext, drawSeries = true, suppliedLayout?: ReturnType<typeof layoutCartesianChart>): ChartMark[] {
  const { model, width, height } = context;
  const layout = suppliedLayout ?? layoutCartesianChart(model, width, height, context.measure);
  const { plot } = layout;
  const { horizontal, count, value: coordinate, category, categoryBand, band } = cartesianGeometry(model, layout);
  const x = coordinate, y = coordinate;
  const marks: ChartMark[] = cartesianAxisMarks(context, layout);

  const dataStart = marks.length;
  const order = model.series.map((series, seriesIndex) => ({ series, seriesIndex }));
  if (model.kind === 'area' && model.grouping === 'standard') order.reverse();
  if (drawSeries) order.forEach(({ series, seriesIndex }) => {
    if (model.kind === 'area') {
      const points = layout.stacks[seriesIndex] ?? [];
      let segment: { index: number; start: number; end: number }[] = [];
      const flush = () => {
        if (!segment.length) return;
        const px = (index: number) => category(index, false);
        const top = segment.map(point => `${px(point.index)},${y(point.end)}`);
        const bottom = [...segment].reverse().map(point => `${px(point.index)},${y(point.start)}`);
        marks.push({ kind: 'path', d: `M ${top.join(' L ')} L ${bottom.join(' L ')} Z`, fill: context.color(series, seriesIndex) });
        segment = [];
      };
      for (let index = 0; index < count; index++) {
        const point = points[index];
        if (point) segment.push({ index, ...point }); else flush();
      }
      flush();
      return;
    }
    if (model.kind === "line") {
      marks.push({ kind: "path", d: linePath(seriesIndex, layout, category, coordinate, series.smooth), stroke: context.color(series, seriesIndex, true), strokeWidth: series.lineStyle?.noFill ? 0 : (series.lineStyle?.width ?? 1.5) * 4 / 3 });
      layout.categories.forEach((_, index) => {
        const current = layout.stacks[seriesIndex]?.[index]?.end;
        if (current !== undefined) marks.push(...chartMarkerMarks(context, series, seriesIndex, index, category(index), y(current)));
      });
      return;
    }
    const bars = layoutBarBand(model, band);
    layout.categories.forEach((_, index) => {
      const current = layout.stacks[seriesIndex]?.[index]?.end;
      if (current === undefined) return;
      const start = layout.stacks[seriesIndex]?.[index]?.start ?? 0;
      const offset = categoryBand(index) + bars.inset + seriesIndex * bars.stride;
      const fill = chartPointColor(context, series, seriesIndex, index);
      marks.push(horizontal
        ? { kind: "rect", x: Math.min(x(current), x(start)), y: offset, width: Math.max(0.5, Math.abs(x(start) - x(current))), height: bars.thickness, fill }
        : { kind: "rect", x: offset, y: Math.min(y(current), y(start)), width: bars.thickness, height: Math.max(0.5, Math.abs(y(start) - y(current))), fill });
    });
  });

  if (drawSeries && marks.length > dataStart) marks.splice(dataStart, marks.length - dataStart, { kind: 'group', clip: plot, marks: marks.slice(dataStart) });

  if (drawSeries) model.series.forEach((series, seriesIndex) => {
    if (!model.dataLabels && !series.dataLabels) return;
    const values = indexChartSequence(series.values);
    const bars = layoutBarBand(model, band);
    layout.categories.forEach((categoryLabel, index) => {
      const value = layout.stacks[seriesIndex]?.[index];
      if (!value) return;
      const across = model.kind === 'area' ? category(index, false) : model.kind === 'line' ? category(index) : categoryBand(index) + bars.inset + seriesIndex * bars.stride + bars.thickness / 2;
      const end = horizontal ? { x: x(value.end), y: across, baseX: x(value.start) }
        : { x: across, y: y(value.end), baseY: y(value.start) };
      marks.push(...chartDataLabelMarks(context, series, seriesIndex, { index, ...end, category: categoryLabel, value: typeof values.get(index) === 'number' ? Number(values.get(index)) : value.end - value.start }));
    });
  });

  if (drawSeries) cartesianAnalyticalData(model, layout.stacks).forEach(({ series, points }, seriesIndex) => {
    const bars = layoutBarBand(model, band);
    const position = (value: number) => model.kind === 'area' ? category(value - 1, false) : model.kind === 'line' ? category(value - 1) : categoryBand(value - 1) + bars.inset + seriesIndex * bars.stride + bars.thickness / 2;
    const overlays = chartAnalyticsMarks(context, series, seriesIndex, points, (category, value) => horizontal ? { x: x(value), y: position(category) } : { x: position(category), y: y(value) });
    if (overlays.geometry.length) marks.push({ kind: 'group', clip: plot, marks: overlays.geometry });
    marks.push(...overlays.annotations);
  });

  if (model.legend !== undefined) {
    marks.push(...legendMarks(context, model.series.map((series, index) => ({
      label: series.title ?? `Series ${index + 1}`,
      swatch: (x: number, y: number): ChartMark => ({ kind: "rect", x, y: y - 7, width: 8, height: 8, fill: context.color(series, index) }),
    })), 12));
  }
  return marks;
}

/** Gaps in a series break the line rather than bridging missing categories. */
function linePath(seriesIndex: number, layout: ReturnType<typeof layoutCartesianChart>, category: (index: number) => number, value: (number: number) => number, smooth = false): string {
  const points = layout.stacks[seriesIndex]?.flatMap((point, index) => point ? [{ index, x: index, y: point.end, plotX: category(index), plotY: value(point.end) }] : []) ?? [];
  return scatterLinePath(points, smooth);
}
