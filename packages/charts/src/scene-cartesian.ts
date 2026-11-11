import { indexChartSequence } from './indexed-data.ts';
import { chartDataLabelMarks } from './label-scene.ts';
import { chartMarkerMarks } from './marker-scene.ts';
import { chartPointColor } from './point-style.ts';
import { chartTickLabel } from './tick-label.ts';
import { layoutBarBand } from "./bar-layout.ts";
import { chartValueCoordinate, layoutCartesianChart, scatterLinePath } from "./layout.ts";
import { legendMarks, line, type ChartMark, type SceneContext } from "./scene-marks.ts";
import { chartFont, chartStroke } from "./scene-style.ts";

/** Bar, column and line charts over shared categories. */
export function cartesianScene(context: SceneContext, drawSeries = true): ChartMark[] {
  const { model, width, height, options } = context;
  const resolve = options.resolveColor;
  const layout = layoutCartesianChart(model, width, height, context.measure);
  const { plot, minimum, maximum } = layout;
  const horizontal = model.kind === "bar";
  const count = Math.max(1, layout.categories.length);
  const valueAxis = model.axes.find(axis => axis.kind === "value");
  const categoryAxis = model.axes.find(axis => axis.kind === "category");
  const x = (value: number) => chartValueCoordinate(value, minimum, maximum, plot.x, plot.width);
  const y = (value: number) => chartValueCoordinate(value, minimum, maximum, plot.y, plot.height, true);
  const marks: ChartMark[] = [];

  if (valueAxis && !valueAxis.deleted) {
    const gridline = chartStroke("gridline", valueAxis?.gridlineStyle, model, resolve);
    const font = chartFont("tick", valueAxis?.textStyle, model, resolve);
    const format = valueAxis.numberFormatCode ?? model.series.find(series => series.values?.formatCode !== undefined)?.values?.formatCode;
    for (const tick of layout.ticks) {
      if (horizontal) {
        if (valueAxis.majorGridlines) marks.push(...line(x(tick), plot.y, x(tick), plot.y + plot.height, gridline));
        marks.push({ kind: "text", text: chartTickLabel(tick, format, options), x: x(tick), y: plot.y + plot.height + 16, anchor: "middle", font });
      } else {
        if (valueAxis.majorGridlines) marks.push(...line(plot.x, y(tick), plot.x + plot.width, y(tick), gridline));
        marks.push({ kind: "text", text: chartTickLabel(tick, format, options), x: plot.x - 6, y: y(tick) + 4, anchor: "end", font });
      }
    }
  }
  const across = chartStroke("axis", model.axes.find(axis => axis.position === "bottom" || axis.position === "top")?.lineStyle, model, resolve);
  const down = chartStroke("axis", model.axes.find(axis => axis.position === "left" || axis.position === "right")?.lineStyle, model, resolve);
  const baseline = horizontal ? plot.y + plot.height : y(0);
  if (!(horizontal ? valueAxis : categoryAxis)?.deleted) marks.push(...line(plot.x, baseline, plot.x + plot.width, baseline, across));
  const spine = horizontal ? x(0) : plot.x;
  if (!(horizontal ? categoryAxis : valueAxis)?.deleted) marks.push(...line(spine, plot.y, spine, plot.y + plot.height, down));

  const order = model.series.map((series, seriesIndex) => ({ series, seriesIndex }));
  if (model.kind === 'area' && model.grouping === 'standard') order.reverse();
  if (drawSeries) order.forEach(({ series, seriesIndex }) => {
    if (model.kind === 'area') {
      const points = layout.stacks[seriesIndex] ?? [];
      let segment: { index: number; start: number; end: number }[] = [];
      const flush = () => {
        if (!segment.length) return;
        const px = (index: number) => plot.x + index / Math.max(1, count - 1) * plot.width;
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
      marks.push({ kind: "path", d: linePath(seriesIndex, layout, series.smooth), stroke: context.color(series, seriesIndex, true), strokeWidth: series.lineStyle?.noFill ? 0 : (series.lineStyle?.width ?? 1.5) * 4 / 3 });
      layout.categories.forEach((_, index) => {
        const current = layout.stacks[seriesIndex]?.[index]?.end;
        if (current !== undefined) marks.push(...chartMarkerMarks(context, series, seriesIndex, index, plot.x + (index + 0.5) / count * plot.width, y(current)));
      });
      return;
    }
    const band = (horizontal ? plot.height : plot.width) / count;
    const bars = layoutBarBand(model, band);
    layout.categories.forEach((_, index) => {
      const current = layout.stacks[seriesIndex]?.[index]?.end;
      if (current === undefined) return;
      const start = layout.stacks[seriesIndex]?.[index]?.start ?? 0;
      const offset = index * band + bars.inset + seriesIndex * bars.stride;
      const fill = chartPointColor(context, series, seriesIndex, index);
      marks.push(horizontal
        ? { kind: "rect", x: Math.min(x(current), x(start)), y: plot.y + offset, width: Math.max(0.5, Math.abs(x(start) - x(current))), height: bars.thickness, fill }
        : { kind: "rect", x: plot.x + offset, y: Math.min(y(current), y(start)), width: bars.thickness, height: Math.max(0.5, Math.abs(y(start) - y(current))), fill });
    });
  });

  if (drawSeries) model.series.forEach((series, seriesIndex) => {
    if (!model.dataLabels && !series.dataLabels) return;
    const values = indexChartSequence(series.values);
    const bars = layoutBarBand(model, (horizontal ? plot.height : plot.width) / count);
    layout.categories.forEach((category, index) => {
      const value = layout.stacks[seriesIndex]?.[index];
      if (!value) return;
      const across = model.kind === 'area' ? index / Math.max(1, count - 1) * plot.width
        : (horizontal ? plot.height : plot.width) / count * index + (model.kind === 'line' ? plot.width / count / 2 : bars.inset + seriesIndex * bars.stride + bars.thickness / 2);
      const end = horizontal ? { x: x(value.end), y: plot.y + across, baseX: x(value.start) }
        : { x: plot.x + across, y: y(value.end), baseY: y(value.start) };
      marks.push(...chartDataLabelMarks(context, series, seriesIndex, { index, ...end, category, value: typeof values.get(index) === 'number' ? Number(values.get(index)) : value.end - value.start }));
    });
  });

  const font = chartFont("category", categoryAxis?.textStyle, model, resolve);
  const step = horizontal ? Math.max(1, Math.ceil(count * font.size * 1.5 / plot.height)) : 1;
  layout.categories.forEach((category, index) => {
    if (categoryAxis?.deleted || index % step !== 0) return;
    marks.push(horizontal
      ? { kind: "text", text: category, x: plot.x - 7, y: plot.y + (index + 0.5) / count * plot.height + 4, anchor: "end", font }
      : { kind: "text", text: category, x: plot.x + (model.kind === 'area' ? index / Math.max(1, count - 1) : (index + 0.5) / count) * plot.width, y: plot.y + plot.height + font.size + 5, anchor: layout.categoryRotation < 0 ? "end" : layout.categoryRotation > 0 ? "start" : "middle", rotate: layout.categoryRotation, font });
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
function linePath(seriesIndex: number, layout: ReturnType<typeof layoutCartesianChart>, smooth = false): string {
  const count = Math.max(1, layout.categories.length);
  const points = layout.stacks[seriesIndex]?.flatMap((point, index) => point ? [{ index, x: index, y: point.end, plotX: layout.plot.x + (index + .5) / count * layout.plot.width, plotY: chartValueCoordinate(point.end, layout.minimum, layout.maximum, layout.plot.y, layout.plot.height, true) }] : []) ?? [];
  return scatterLinePath(points, smooth);
}
