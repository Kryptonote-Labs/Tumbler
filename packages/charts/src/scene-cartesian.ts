import { layoutBarBand } from "./bar-layout.ts";
import { cartesianStack, chartSequenceValue, chartValueCoordinate, layoutCartesianChart } from "./layout.ts";
import type { ChartSeries, SupportedChartModel } from "./model.ts";
import { legendMarks, line, type ChartMark, type SceneContext } from "./scene-marks.ts";
import { chartFont, chartStroke } from "./scene-style.ts";

/** Bar, column and line charts over shared categories. */
export function cartesianScene(context: SceneContext): ChartMark[] {
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

  if (model.axes.some(axis => axis.kind === "value" && axis.majorGridlines)) {
    const gridline = chartStroke("gridline", valueAxis?.gridlineStyle, model, resolve);
    const font = chartFont("tick", valueAxis?.textStyle, model, resolve);
    for (const tick of layout.ticks) {
      if (horizontal) {
        marks.push(...line(x(tick), plot.y, x(tick), plot.y + plot.height, gridline));
        marks.push({ kind: "text", text: String(tick), x: x(tick), y: plot.y + plot.height + 16, anchor: "middle", font });
      } else {
        marks.push(...line(plot.x, y(tick), plot.x + plot.width, y(tick), gridline));
        marks.push({ kind: "text", text: String(tick), x: plot.x - 6, y: y(tick) + 4, anchor: "end", font });
      }
    }
  }
  const across = chartStroke("axis", model.axes.find(axis => axis.position === "bottom" || axis.position === "top")?.lineStyle, model, resolve);
  const down = chartStroke("axis", model.axes.find(axis => axis.position === "left" || axis.position === "right")?.lineStyle, model, resolve);
  const baseline = horizontal ? plot.y + plot.height : y(0);
  marks.push(...line(plot.x, baseline, plot.x + plot.width, baseline, across));
  const spine = horizontal ? x(0) : plot.x;
  marks.push(...line(spine, plot.y, spine, plot.y + plot.height, down));

  model.series.forEach((series, seriesIndex) => {
    if (model.kind === "line") {
      marks.push({ kind: "path", d: linePath(model, series, layout), stroke: context.color(series, seriesIndex, true), strokeWidth: 2 });
      layout.categories.forEach((_, index) => {
        const current = value(model, series, index);
        if (current !== undefined) marks.push({ kind: "circle", cx: plot.x + (index + 0.5) / count * plot.width, cy: y(current), r: 3, fill: context.color(series, seriesIndex, true) });
      });
      return;
    }
    const band = (horizontal ? plot.height : plot.width) / count;
    const bars = layoutBarBand(model, band);
    layout.categories.forEach((_, index) => {
      const current = value(model, series, index);
      if (current === undefined) return;
      const start = cartesianStack(model, seriesIndex, index)?.start ?? 0;
      const offset = index * band + bars.inset + seriesIndex * bars.stride;
      const fill = context.color(series, seriesIndex);
      marks.push(horizontal
        ? { kind: "rect", x: Math.min(x(current), x(start)), y: plot.y + offset, width: Math.max(0.5, Math.abs(x(start) - x(current))), height: bars.thickness, fill }
        : { kind: "rect", x: plot.x + offset, y: Math.min(y(current), y(start)), width: bars.thickness, height: Math.max(0.5, Math.abs(y(start) - y(current))), fill });
    });
  });

  const font = chartFont("category", categoryAxis?.textStyle, model, resolve);
  const step = horizontal ? Math.max(1, Math.ceil(count * font.size * 1.5 / plot.height)) : 1;
  layout.categories.forEach((category, index) => {
    if (index % step !== 0) return;
    marks.push(horizontal
      ? { kind: "text", text: category, x: plot.x - 7, y: plot.y + (index + 0.5) / count * plot.height + 4, anchor: "end", font }
      : { kind: "text", text: category, x: plot.x + (index + 0.5) / count * plot.width, y: plot.y + plot.height + font.size + 5, anchor: layout.categoryRotation < 0 ? "end" : layout.categoryRotation > 0 ? "start" : "middle", rotate: layout.categoryRotation, font });
  });
  if (model.legend !== undefined) {
    marks.push(...legendMarks(context, model.series.map((series, index) => ({
      label: series.title ?? `Series ${index + 1}`,
      swatch: (x: number, y: number): ChartMark => ({ kind: "rect", x, y: y - 7, width: 8, height: 8, fill: context.color(series, index) }),
    })), 12));
  }
  return marks;
}

function value(model: SupportedChartModel, series: ChartSeries, index: number): number | undefined {
  const point = chartSequenceValue(series.values, index);
  return typeof point === "number" ? cartesianStack(model, model.series.indexOf(series), index)?.end : undefined;
}

/** Gaps in a series break the line rather than bridging missing categories. */
function linePath(model: SupportedChartModel, series: ChartSeries, layout: ReturnType<typeof layoutCartesianChart>): string {
  const count = Math.max(1, layout.categories.length);
  let path = "";
  let previous = -2;
  for (let index = 0; index < count; index += 1) {
    const current = value(model, series, index);
    if (current === undefined) continue;
    const x = layout.plot.x + (index + 0.5) / count * layout.plot.width;
    const y = chartValueCoordinate(current, layout.minimum, layout.maximum, layout.plot.y, layout.plot.height, true);
    path += `${index === previous + 1 ? " L" : " M"} ${x} ${y}`;
    previous = index;
  }
  return path.trim();
}
