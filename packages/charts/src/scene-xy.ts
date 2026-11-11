import { chartLegendFill } from './gradient-scene.ts';
import { chartPointGradient } from './gradient-scene.ts';
import { chartShapeMarks } from './shape-scene.ts';
import { chartPointStroke, chartSeriesStroke, chartStrokeMark } from './stroke-scene.ts';
import { xyGeometry } from './xy-geometry.ts';
import { xyAxisMarks } from './axis-scene.ts';
import { chartAnalyticsMarks } from './analytics-scene.ts';
import { chartDataLabelMarks } from './label-scene.ts';
import { chartMarkerMarks } from './marker-scene.ts';
import { chartPointColor } from './point-style.ts';
import { layoutBubbleChart, layoutScatterChart, scatterLinePath } from "./layout.ts";
import type { ChartSeries, SupportedChartModel } from "./model.ts";
import { legendMarks, type ChartMark, type SceneContext } from "./scene-marks.ts";

/** Scatter and bubble charts: numeric X and Y axes with series clipped to the plot. */
export function xyScene(context: SceneContext): ChartMark[] {
  const { model, height } = context;
  const bubbles = model.kind === "bubble" ? layoutBubbleChart(model, context.width, height) : undefined;
  const layout = bubbles ?? layoutScatterChart(model, context.width, height);
  const { plot } = layout;
  const { x: projectX, y: projectY } = xyGeometry(model, layout);
  const marks: ChartMark[] = [...chartShapeMarks(context, plot, model.plotArea), ...xyAxisMarks(context, layout)];

  const series: ChartMark[] = [];
  const labels: ChartMark[] = [];
  model.series.forEach((item, index) => {
    if (bubbles) {
      for (const point of bubbles.series[index] ?? []) {
        if (point.radius > 0) series.push({ kind: "circle", cx: point.plotX, cy: point.plotY, r: point.radius, ...chartPointGradient(context, item, point.index, { x: point.plotX - point.radius, y: point.plotY - point.radius, width: point.radius * 2, height: point.radius * 2 }), fill: chartPointColor(context, item, index, point.index), ...chartPointStroke(context, item, index, point.index, chartPointColor(context, item, index, point.index, true)), fillOpacity: 0.72 });
      }
      for (const point of bubbles.series[index] ?? []) labels.push(...chartDataLabelMarks(context, item, index, { index: point.index, x: point.plotX, y: point.plotY, category: String(point.x), value: point.y, bubbleSize: point.size }));
      return;
    }
    const points = layout.series[index] ?? [];
    if (lineVisible(model, item)) series.push({ kind: "path", d: scatterLinePath(points, smooth(model, item)), ...chartStrokeMark(chartSeriesStroke(context, item, index)) });
    if (markerVisible(model, item)) for (const point of points) series.push(...chartMarkerMarks(context, item, index, point.index, point.plotX, point.plotY));
    for (const point of points) labels.push(...chartDataLabelMarks(context, item, index, { index: point.index, x: point.plotX, y: point.plotY, category: String(point.x), value: point.y }));
  });
  model.series.forEach((item, index) => {
    const overlays = chartAnalyticsMarks(context, item, index, layout.series[index] ?? [], (x, y) => ({ x: projectX(x), y: projectY(y) }));
    series.push(...overlays.geometry);
    labels.push(...overlays.annotations);
  });
  marks.push({ kind: "group", clip: plot, marks: series });
  marks.push(...labels);

  if (model.legend !== undefined) {
    marks.push(...legendMarks(context, model.series.map((item, index) => ({
      label: item.title ?? `Series ${index + 1}`,
      swatch: (x: number, y: number): ChartMark => bubbles
        ? { kind: "circle", cx: x + 5, cy: y - 3, r: 5, ...chartLegendFill(context, item, { x, y: y - 8, width: 10, height: 10 }), fill: item.noFill ? "none" : context.color(item, index) }
        : { kind: "rect", x, y: y - 8, width: 10, height: 10, ...chartLegendFill(context, item, { x, y: y - 8, width: 10, height: 10 }), fill: item.noFill ? "none" : context.color(item, index) },
    })), 15));
  }
  return marks;
}

function lineVisible(model: SupportedChartModel, series: ChartSeries): boolean {
  return series.smooth === true || model.scatterStyle === "line" || model.scatterStyle === "line-marker" || model.scatterStyle === "smooth" || model.scatterStyle === "smooth-marker";
}

function markerVisible(model: SupportedChartModel, series: ChartSeries): boolean {
  return (series.marker?.symbol !== "none" || series.pointFormats?.some(point => point.marker?.symbol !== undefined && point.marker.symbol !== "none") === true) && (model.scatterStyle === "marker" || model.scatterStyle === "line-marker" || model.scatterStyle === "smooth-marker");
}

function smooth(model: SupportedChartModel, series: ChartSeries): boolean {
  return series.smooth === true || model.scatterStyle === "smooth" || model.scatterStyle === "smooth-marker";
}
