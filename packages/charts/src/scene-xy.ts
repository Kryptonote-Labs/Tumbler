import { chartDataLabelMarks } from './label-scene.ts';
import { chartMarkerMarks } from './marker-scene.ts';
import { chartPointColor } from './point-style.ts';
import { chartTickLabel } from './tick-label.ts';
import { chartValueCoordinate, layoutBubbleChart, layoutScatterChart, scatterLinePath, type ScatterPoint } from "./layout.ts";
import type { ChartAxis, ChartSeries, SupportedChartModel } from "./model.ts";
import { legendMarks, line, type ChartMark, type SceneContext } from "./scene-marks.ts";
import { chartFont, chartStroke } from "./scene-style.ts";

/** Scatter and bubble charts: numeric X and Y axes with series clipped to the plot. */
export function xyScene(context: SceneContext): ChartMark[] {
  const { model, height, options } = context;
  const resolve = options.resolveColor;
  const bubbles = model.kind === "bubble" ? layoutBubbleChart(model, context.width, height) : undefined;
  const layout = bubbles ?? layoutScatterChart(model, context.width, height);
  const { plot } = layout;
  const xAxis = axis(model, 0);
  const yAxis = axis(model, 1);
  const xFormat = xAxis?.numberFormatCode ?? model.series.find(series => series.xValues?.formatCode !== undefined)?.xValues?.formatCode;
  const yFormat = yAxis?.numberFormatCode ?? model.series.find(series => series.values?.formatCode !== undefined)?.values?.formatCode;
  const label = (value: number, format: string | undefined) => chartTickLabel(value, format, options);
  const marks: ChartMark[] = [];

  const yGrid = chartStroke("gridline", yAxis?.gridlineStyle, model, resolve);
  const yFont = chartFont("tick", yAxis?.textStyle, model, resolve);
  for (const tick of (yAxis?.deleted ? [] : layout.yTicks)) {
    const y = chartValueCoordinate(tick, layout.yMinimum, layout.yMaximum, plot.y, plot.height, true);
    if (yAxis?.majorGridlines) marks.push(...line(plot.x, y, plot.x + plot.width, y, yGrid));
    marks.push({ kind: "text", text: label(tick, yFormat), x: plot.x - 6, y: y + 4, anchor: "end", font: yFont });
  }
  const xGrid = chartStroke("gridline", xAxis?.gridlineStyle, model, resolve);
  const xFont = chartFont("tick", xAxis?.textStyle, model, resolve);
  for (const tick of (xAxis?.deleted ? [] : layout.xTicks)) {
    const x = chartValueCoordinate(tick, layout.xMinimum, layout.xMaximum, plot.x, plot.width);
    if (xAxis?.majorGridlines) marks.push(...line(x, plot.y, x, plot.y + plot.height, xGrid));
    marks.push({ kind: "text", text: label(tick, xFormat), x, y: plot.y + plot.height + 17, anchor: "middle", font: xFont });
  }
  const bottom = plot.y + plot.height;
  if (!xAxis?.deleted) marks.push(...line(plot.x, bottom, plot.x + plot.width, bottom, chartStroke("axis", model.axes.find(axis => axis.position === "bottom" || axis.position === "top")?.lineStyle, model, resolve)));
  if (!yAxis?.deleted) marks.push(...line(plot.x, plot.y, plot.x, bottom, chartStroke("axis", model.axes.find(axis => axis.position === "left" || axis.position === "right")?.lineStyle, model, resolve)));

  const series: ChartMark[] = [];
  model.series.forEach((item, index) => {
    if (bubbles) {
      for (const point of bubbles.series[index] ?? []) {
        if (point.radius > 0) series.push({ kind: "circle", cx: point.plotX, cy: point.plotY, r: point.radius, fill: chartPointColor(context, item, index, point.index), stroke: chartPointColor(context, item, index, point.index, true), fillOpacity: 0.72 });
      }
      for (const point of bubbles.series[index] ?? []) series.push(...chartDataLabelMarks(context, item, index, { index: point.index, x: point.plotX, y: point.plotY, category: String(point.x), value: point.y, bubbleSize: point.size }));
      return;
    }
    const points = layout.series[index] ?? [];
    const stroke = context.color(item, index, true);
    if (lineVisible(model, item)) series.push({ kind: "path", d: scatterLinePath(points, smooth(model, item)), stroke, strokeWidth: item.lineStyle?.noFill ? 0 : (item.lineStyle?.width ?? 1.5) * 4 / 3 });
    if (markerVisible(model, item)) for (const point of points) series.push(...chartMarkerMarks(context, item, index, point.index, point.plotX, point.plotY));
    for (const point of points) series.push(...chartDataLabelMarks(context, item, index, { index: point.index, x: point.plotX, y: point.plotY, category: String(point.x), value: point.y }));
  });
  marks.push({ kind: "group", clip: plot, marks: series });

  const titleFont = chartFont("axisTitle", undefined, model, resolve);
  if (!xAxis?.deleted && xAxis?.title !== undefined) marks.push({ kind: "text", text: xAxis.title, x: plot.x + plot.width / 2, y: height - 4, anchor: "middle", font: titleFont });
  if (!yAxis?.deleted && yAxis?.title !== undefined) marks.push({ kind: "text", text: yAxis.title, x: 12, y: plot.y + plot.height / 2, anchor: "middle", font: titleFont, rotate: -90 });
  if (model.legend !== undefined) {
    marks.push(...legendMarks(context, model.series.map((item, index) => ({
      label: item.title ?? `Series ${index + 1}`,
      swatch: (x: number, y: number): ChartMark => bubbles
        ? { kind: "circle", cx: x + 5, cy: y - 3, r: 5, fill: context.color(item, index) }
        : { kind: "rect", x, y: y - 8, width: 10, height: 10, fill: context.color(item, index) },
    })), 15));
  }
  return marks;
}

function axis(model: SupportedChartModel, index: number): ChartAxis | undefined {
  const id = model.axisIds?.[index];
  if (id !== undefined) return model.axes.find(axis => axis.id === id);
  return model.axes.filter(axis => axis.kind === "value")[index];
}

function lineVisible(model: SupportedChartModel, series: ChartSeries): boolean {
  return series.smooth === true || model.scatterStyle === "line" || model.scatterStyle === "line-marker" || model.scatterStyle === "smooth" || model.scatterStyle === "smooth-marker";
}

function markerVisible(model: SupportedChartModel, series: ChartSeries): boolean {
  return series.marker?.symbol !== "none" && (model.scatterStyle === "marker" || model.scatterStyle === "line-marker" || model.scatterStyle === "smooth-marker");
}

function smooth(model: SupportedChartModel, series: ChartSeries): boolean {
  return series.smooth === true || model.scatterStyle === "smooth" || model.scatterStyle === "smooth-marker";
}
