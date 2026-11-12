import type { ChartSceneOptions } from './scene-marks.ts';
import { fitValueAxisLabels } from './value-axis-margins.ts';
import { chartPieData, chartPieSlices } from './pie-data.ts';
import { layoutChartLegend } from './legend-layout.ts';
import { chartAxisTitleSpace } from './axis-title-space.ts';
import { chartSurfaceLevels } from './legend-items.ts';
import { chartManualPlot, chartOuterPlot, chartOuterXYPlot } from './manual-layout.ts';
import { fitBubbleAxis } from './bubble-axis.ts';
import { xyGeometry } from './xy-geometry.ts';
import { chartDateScale, type ChartDateScale } from './date-axis.ts';
import { chartAnalyticalBounds, cartesianAnalyticalData } from './analytics-bounds.ts';
import { chartLogarithmicScale, chartAxisCoordinate } from './axis-scale.ts';
import { assertChartSceneBudget } from './scene-budget.ts';
import { chartStacks, indexChartSequence, type StackPoint } from './indexed-data.ts';
import { chartTitleHeight } from './title-scene.ts';
import { chartFont, type ChartFont } from './scene-style.ts';
import { cartesianAxisScale, chartAxisTicks, roundChartTick } from "./axis-scale.ts";
import { BUBBLE_CHART_POINT_LIMIT, type ChartDataSequence, type SupportedChartModel } from "./model.ts";

export interface ChartRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CartesianChartLayout {
  readonly plot: ChartRect;
  readonly categories: readonly string[];
  readonly stacks: readonly (readonly (StackPoint | undefined)[])[];
  readonly categoryRotation: number;
  readonly categoryScale?: ChartDateScale;
  readonly categoryDomain?: { readonly minimum: number; readonly maximum: number };
  readonly minimum: number;
  readonly maximum: number;
  readonly ticks: readonly number[];
}

export interface PieSlice {
  readonly index: number;
  readonly value: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

export interface ScatterPoint {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly plotX: number;
  readonly plotY: number;
}

export interface ScatterChartLayout {
  readonly plot: ChartRect;
  readonly xMinimum: number;
  readonly xMaximum: number;
  readonly yMinimum: number;
  readonly yMaximum: number;
  readonly xTicks: readonly number[];
  readonly yTicks: readonly number[];
  readonly series: readonly (readonly ScatterPoint[])[];
}

export interface BubblePoint extends ScatterPoint {
  readonly size: number;
  readonly radius: number;
  readonly negative: boolean;
}

export interface BubbleChartLayout {
  readonly plot: ChartRect;
  readonly xMinimum: number;
  readonly xMaximum: number;
  readonly yMinimum: number;
  readonly yMaximum: number;
  readonly xTicks: readonly number[];
  readonly yTicks: readonly number[];
  readonly series: readonly (readonly BubblePoint[])[];
}

export function layoutCartesianChart(model: SupportedChartModel, width: number, height: number, measure: (text: string, font: ChartFont) => number = (text, font) => text.length * font.size * .55, options: ChartSceneOptions = {}): CartesianChartLayout {
  if (model.kind !== 'surface' || !model.legend) return cartesianFrame(model, width, height, measure, undefined, options);
  // Choose surface levels before the legend reserves space; band formatting must not change its own entry list.
  const scale = cartesianFrame({ ...model, legend: undefined }, width, height, measure, undefined, options);
  return cartesianFrame(model, width, height, measure, { minimum: scale.minimum, maximum: scale.maximum, ticks: scale.ticks }, options);
}

function cartesianFrame(model: SupportedChartModel, width: number, height: number, measure: (text: string, font: ChartFont) => number, surfaceScale?: Pick<CartesianChartLayout, 'minimum' | 'maximum' | 'ticks'>, options: ChartSceneOptions = {}): CartesianChartLayout {
  finiteSize(width, "chart width");
  finiteSize(height, "chart height");
  const count = assertChartSceneBudget(model);
  const categories = categoryLabels(model, count);
  const stacks = chartStacks(model, count);
  const horizontal = model.kind === "bar";
  const categoryAxis = model.axes.find(axis => axis.kind === "category");
  const categoryFont = chartFont("category", categoryAxis?.textStyle, model);
  const labelWidth = Math.max(0, ...categories.map(label => measure(label, categoryFont)));
  const legend = layoutChartLegend(model, width, height, measure, surfaceScale && chartSurfaceLevels(surfaceScale), options.resolveColor, options);
  const titleSpace = chartAxisTitleSpace(model, measure);
  const bottomLegend = (legend.space.bottom || 8) + titleSpace.bottom;
  const left = legend.space.left + (horizontal ? labelWidth + 16 : 30) + titleSpace.left;
  const plotWidth = Math.max(1, width - left - 16 - legend.space.right - titleSpace.right);
  const categoryRotation = horizontal ? 0 : categoryAxis?.labelRotation ?? (labelWidth + 8 > plotWidth / Math.max(1, categories.length) ? -45 : 0);
  const radians = Math.abs(categoryRotation) * Math.PI / 180;
  const categoryHeight = horizontal ? 20 : Math.abs(Math.sin(radians)) * labelWidth + Math.abs(Math.cos(radians)) * categoryFont.size + 14;
  const top = (model.title === undefined || model.titleOverlay ? 16 : chartTitleHeight(model, measure) + 28) + legend.space.top + titleSpace.top;
  const automaticPlot = { x: left, y: top, width: plotWidth, height: Math.max(1, height - top - bottomLegend - categoryHeight) };
  let plot = chartManualPlot(model.plotLayout, automaticPlot, { x: legend.space.left, y: top, width: width - 16 - legend.space.left - legend.space.right, height: height - top - bottomLegend }, width, height);
  const axis = model.axes.find((candidate) => candidate.kind === "value");
  let dataMinimum = 0, dataMaximum = 0;
  for (const points of stacks) for (const point of points) if (point) {
    dataMinimum = Math.min(dataMinimum, point.start, point.end);
    dataMaximum = Math.max(dataMaximum, point.start, point.end);
  }
  const analytic = cartesianAnalyticalData(model, stacks).filter(data => data.points.length).map(data => chartAnalyticalBounds(data.series, data.points));
  for (const bounds of analytic) { dataMinimum = Math.min(dataMinimum, bounds.yMinimum); dataMaximum = Math.max(dataMaximum, bounds.yMaximum); }
  const minimum = axis?.minimum ?? dataMinimum;
  const maximum = axis?.maximum ?? dataMaximum;
  const scale = surfaceScale ?? (axis?.logBase ? chartLogarithmicScale([...model.series.flatMap(series => series.values?.points.flatMap(point => typeof point.value === "number" ? [point.value] : []) ?? []), ...analytic.flatMap(bounds => [bounds.yPositiveMinimum, bounds.yMaximum])], axis) : cartesianAxisScale(minimum, maximum, axis, model.grouping === "percent-stacked", {
    length: Math.max(1, horizontal ? plot.width : plot.height),
    labelSize: chartFont("tick", axis?.textStyle, model).size * (horizontal ? 2 : 1),
  }));
  const categoryValues = indexChartSequence(model.series.find(series => series.categories !== undefined)?.categories);
  const categoryScale = categoryAxis?.dateAxis ? chartDateScale(Array.from({ length: count }, (_, index) => {
    const value = categoryValues.get(index); return typeof value === 'number' ? value : undefined;
  }), categoryAxis, model.dateSystem ?? '1900', axis?.crossBetween !== 'midCat') : undefined;
  if (model.plotLayout?.target !== 'inner' && model.plotLayout) plot = chartManualPlot(model.plotLayout, automaticPlot, chartOuterPlot(model, { plot: automaticPlot, categories, stacks, categoryRotation, ...scale, ...(categoryScale ? { categoryScale } : {}) }, measure), width, height);
  const inset = model.kind === 'area' || axis?.crossBetween === 'midCat' ? 0 : .5;
  const categoryMinimum = Math.min(1 - inset, ...analytic.map(bounds => bounds.xMinimum - inset));
  const categoryMaximum = Math.max(count + inset, ...analytic.map(bounds => bounds.xMaximum + inset));
  const categoryDomain = { minimum: categoryMinimum, maximum: categoryMaximum > categoryMinimum ? categoryMaximum : categoryMinimum + 1 };
  const layout = { plot, categories, stacks, categoryRotation, ...scale, categoryDomain, ...(categoryScale ? { categoryScale } : {}) };
  const limits = { left: legend.space.left + titleSpace.left + 6, right: width - legend.space.right - titleSpace.right - 6 };
  const fitted = fitValueAxisLabels(model, layout, measure, options, limits);
  const rotation = !model.plotLayout && !model.threeD && model.kind !== 'radar' && !horizontal && categoryAxis?.labelRotation === undefined
    ? labelWidth + 8 > fitted.width / Math.max(1, categories.length) ? -45 : 0 : categoryRotation;
  if (rotation === categoryRotation) return Object.freeze({ ...layout, plot: fitted });
  const angle = Math.abs(rotation) * Math.PI / 180;
  const reserved = Math.abs(Math.sin(angle)) * labelWidth + Math.abs(Math.cos(angle)) * categoryFont.size + 14;
  const resized = { ...fitted, height: Math.max(1, fitted.height + categoryHeight - reserved) };
  const finalScale = surfaceScale ?? (axis?.logBase ? scale : cartesianAxisScale(minimum, maximum, axis, model.grouping === 'percent-stacked', {
    length: resized.height, labelSize: chartFont('tick', axis?.textStyle, model).size,
  }));
  const final = { ...layout, ...finalScale, categoryRotation: rotation, plot: resized };
  return Object.freeze({ ...final, plot: fitValueAxisLabels(model, final, measure, options, limits) });
}

/** Lays out paired numeric X/Y values without converting them to category positions. */
export function layoutScatterChart(model: SupportedChartModel, width: number, height: number, measure: (text: string, font: ChartFont) => number = (text, font) => text.length * font.size * .55): ScatterChartLayout {
  finiteSize(width, "chart width");
  finiteSize(height, "chart height");
  const titleHeight = model.title === undefined || model.titleOverlay ? 10 : model.titleStyle?.rotation ? chartTitleHeight(model, measure) + 8 : Math.min(34, Math.max(20, height * 0.12));
  const legend = layoutChartLegend(model, width, height, measure);
  const titleSpace = chartAxisTitleSpace(model, measure, true);
  const leftLegend = legend.space.left + titleSpace.left, rightLegend = legend.space.right + titleSpace.right;
  const topLegend = legend.space.top + titleSpace.top, bottomLegend = legend.space.bottom + titleSpace.bottom;
  const automaticPlot = {
    x: leftLegend + 58,
    y: titleHeight + topLegend + 8,
    width: Math.max(1, width - leftLegend - rightLegend - 76),
    height: Math.max(1, height - titleHeight - topLegend - bottomLegend - 48),
  };
  let plot = chartManualPlot(model.plotLayout, automaticPlot, { x: leftLegend, y: titleHeight + topLegend + 8, width: width - leftLegend - rightLegend - 18, height: height - titleHeight - topLegend - bottomLegend - 16 }, width, height);
  const rawSeries = model.series.map((series) => {
    const yByIndex = new Map(series.values?.points.flatMap((point) => typeof point.value === "number" ? [[point.index, point.value] as const] : []) ?? []);
    return Object.freeze(series.xValues?.points.flatMap((point) => {
      const y = yByIndex.get(point.index);
      return typeof point.value === "number" && y !== undefined ? [{ index: point.index, x: point.value, y }] : [];
    }) ?? []);
  });
  const xValues = rawSeries.flatMap((series) => series.map((point) => point.x));
  const yValues = rawSeries.flatMap((series) => series.map((point) => point.y));
  const axisById = (index: number) => {
    const id = model.axisIds?.[index];
    return id === undefined ? undefined : model.axes.find((axis) => axis.id === id);
  };
  const valueAxes = model.axes.filter((axis) => axis.kind === "value");
  const xAxis = axisById(0) ?? valueAxes.find((axis) => axis.position === "bottom" || axis.position === "top");
  const yAxis = axisById(1) ?? valueAxes.find((axis) => axis.position === "left" || axis.position === "right");
  const analytic = model.series.map((series, index) => chartAnalyticalBounds(series, rawSeries[index] ?? []));
  const xDomain = xAxis?.logBase ? chartLogarithmicScale([...xValues, ...analytic.flatMap(bounds => [bounds.xPositiveMinimum, bounds.xMaximum])], xAxis) : numericDomain([...xValues, ...analytic.flatMap(bounds => [bounds.xMinimum, bounds.xMaximum]).filter(Number.isFinite)], xAxis?.minimum, xAxis?.maximum);
  const yDomain = yAxis?.logBase ? chartLogarithmicScale([...yValues, ...analytic.flatMap(bounds => [bounds.yPositiveMinimum, bounds.yMaximum])], yAxis) : numericDomain([...yValues, ...analytic.flatMap(bounds => [bounds.yMinimum, bounds.yMaximum]).filter(Number.isFinite)], yAxis?.minimum, yAxis?.maximum);
  const xTicks = xAxis?.logBase ? chartLogarithmicScale([...xValues, ...analytic.flatMap(bounds => [bounds.xPositiveMinimum, bounds.xMaximum])], xAxis).ticks : xAxis?.majorUnit === undefined ? linearTicks(xDomain.minimum, xDomain.maximum, 5) : chartAxisTicks(xDomain.minimum, xDomain.maximum, xAxis.majorUnit);
  const yTicks = yAxis?.logBase ? chartLogarithmicScale([...yValues, ...analytic.flatMap(bounds => [bounds.yPositiveMinimum, bounds.yMaximum])], yAxis).ticks : yAxis?.majorUnit === undefined ? linearTicks(yDomain.minimum, yDomain.maximum, 5) : chartAxisTicks(yDomain.minimum, yDomain.maximum, yAxis.majorUnit);
  if (model.plotLayout && model.plotLayout.target !== 'inner') {
    const automatic = { plot: automaticPlot, xMinimum: xDomain.minimum, xMaximum: xDomain.maximum, yMinimum: yDomain.minimum, yMaximum: yDomain.maximum, xTicks, yTicks, series: [] };
    plot = chartManualPlot(model.plotLayout, automaticPlot, chartOuterXYPlot(model, automatic, measure), width, height);
  }
  const series = rawSeries.map((points) => Object.freeze(points.filter(point => (!xAxis?.logBase || point.x > 0) && (!yAxis?.logBase || point.y > 0)).map((point) => Object.freeze({
    ...point,
    plotX: chartAxisCoordinate(point.x, xDomain.minimum, xDomain.maximum, plot.x, plot.width, xAxis),
    plotY: chartAxisCoordinate(point.y, yDomain.minimum, yDomain.maximum, plot.y, plot.height, yAxis, true),
  }))));
  return Object.freeze({
    plot,
    xMinimum: xDomain.minimum,
    xMaximum: xDomain.maximum,
    yMinimum: yDomain.minimum,
    yMaximum: yDomain.maximum,
    xTicks, yTicks,
    series: Object.freeze(series),
  });
}

/** Lays out sparse X/Y/size triples with area- or width-proportional bubble radii. */
export function layoutBubbleChart(model: SupportedChartModel, width: number, height: number, measure?: (text: string, font: ChartFont) => number): BubbleChartLayout {
  const pointUpperBound = model.series.reduce((total, series) => total + Math.min(
    series.xValues?.points.length ?? 0,
    series.values?.points.length ?? 0,
    series.bubbleSizes?.points.length ?? 0,
  ), 0);
  if (pointUpperBound > BUBBLE_CHART_POINT_LIMIT) {
    throw new RangeError(`Bubble chart exceeds ${BUBBLE_CHART_POINT_LIMIT} potential points.`);
  }
  const paired = model.series.map((series) => {
    const yByIndex = numericPoints(series.values);
    const sizeByIndex = numericPoints(series.bubbleSizes);
    return Object.freeze(series.xValues?.points.flatMap((point) => {
      const y = yByIndex.get(point.index);
      const size = sizeByIndex.get(point.index);
      return typeof point.value === "number" && y !== undefined && size !== undefined
        ? [{ index: point.index, x: point.value, y, size }]
        : [];
    }) ?? []);
  });
  const projectedModel: SupportedChartModel = {
    ...model,
    series: model.series.map((series, seriesIndex) => {
      const points = paired[seriesIndex] ?? [];
      return {
        ...series,
        xValues: numericSequence(series.xValues, points.map((point) => ({ index: point.index, value: point.x }))),
        values: numericSequence(series.values, points.map((point) => ({ index: point.index, value: point.y }))),
      };
    }),
  };
  const xy = layoutScatterChart(projectedModel, width, height, measure);
  if (xy.plot.width <= 0 || xy.plot.height <= 0) return { ...xy, series: model.series.map(() => []) };
  const visibleMagnitudes = paired.flatMap((points) => points.flatMap((point) =>
    point.size > 0 || (point.size < 0 && model.showNegativeBubbles === true) ? [Math.abs(point.size)] : []
  ));
  const maximumMagnitude = Math.max(0, ...visibleMagnitudes) || 1;
  const maximumRadius = Math.min(xy.plot.width, xy.plot.height) * 0.1 * (model.bubbleScale ?? 100) / 100;
  const { xAxis, yAxis } = xyGeometry(model, xy);
  const visibleRadius = visibleMagnitudes.length ? maximumRadius : 0;
  const xScale = fitBubbleAxis(xy.xMinimum, xy.xMaximum, xy.series.flatMap(series => series.map(point => point.x)), xAxis, visibleRadius, xy.plot.width, chartFont('tick', xAxis?.textStyle, model).size * 2);
  const yScale = fitBubbleAxis(xy.yMinimum, xy.yMaximum, xy.series.flatMap(series => series.map(point => point.y)), yAxis, visibleRadius, xy.plot.height, chartFont('tick', yAxis?.textStyle, model).size, true);
  const series = paired.map((points, seriesIndex) => {
    const xyByIndex = new Map((xy.series[seriesIndex] ?? []).map((point) => [point.index, point] as const));
    return Object.freeze(points.filter(point => xyByIndex.has(point.index)).map((point): BubblePoint => {
      const position = xyByIndex.get(point.index)!;
      const magnitude = Math.abs(point.size);
      const visible = point.size > 0 || (point.size < 0 && model.showNegativeBubbles === true);
      const ratio = visible ? magnitude / maximumMagnitude : 0;
      const radius = maximumRadius * (model.bubbleSizeRepresentation === "width" ? ratio : Math.sqrt(ratio));
      return Object.freeze({ ...position, plotX: chartAxisCoordinate(point.x, xScale.minimum, xScale.maximum, xy.plot.x, xy.plot.width, xAxis), plotY: chartAxisCoordinate(point.y, yScale.minimum, yScale.maximum, xy.plot.y, xy.plot.height, yAxis, true), size: point.size, radius, negative: point.size < 0 });
    }));
  });
  return Object.freeze({ ...xy, xMinimum: xScale.minimum, xMaximum: xScale.maximum, xTicks: xScale.ticks, yMinimum: yScale.minimum, yMaximum: yScale.maximum, yTicks: yScale.ticks, series: Object.freeze(series) });
}

/** Produces disconnected straight or Catmull-Rom-smoothed paths across consecutive cache indexes. */
export function scatterLinePath(points: readonly ScatterPoint[], smooth = false): string {
  const runs: ScatterPoint[][] = [];
  for (const point of points) {
    const run = runs.at(-1);
    if (run === undefined || run.at(-1)!.index + 1 !== point.index) runs.push([point]);
    else run.push(point);
  }
  return runs.map((run) => {
    if (run.length === 0) return "";
    let path = `M ${run[0]!.plotX} ${run[0]!.plotY}`;
    for (let index = 1; index < run.length; index += 1) {
      const current = run[index]!;
      if (!smooth) {
        path += ` L ${current.plotX} ${current.plotY}`;
        continue;
      }
      const previous = run[index - 1]!;
      const before = run[index - 2] ?? previous;
      const after = run[index + 1] ?? current;
      const c1x = previous.plotX + (current.plotX - before.plotX) / 6;
      const c1y = previous.plotY + (current.plotY - before.plotY) / 6;
      const c2x = current.plotX - (after.plotX - previous.plotX) / 6;
      const c2y = current.plotY - (after.plotY - previous.plotY) / 6;
      path += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${current.plotX} ${current.plotY}`;
    }
    return path;
  }).join(" ");
}

export function chartSequenceValue(sequence: ChartDataSequence | undefined, index: number): string | number | undefined {
  return sequence?.points.find((point) => point.index === index)?.value;
}

export function chartValueCoordinate(value: number, minimum: number, maximum: number, start: number, length: number, reverse = false): number {
  if (![value, minimum, maximum, start, length].every(Number.isFinite) || maximum <= minimum || length < 0) {
    throw new RangeError("Chart scale requires finite ordered bounds and a non-negative length.");
  }
  const ratio = Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum)));
  return start + (reverse ? 1 - ratio : ratio) * length;
}

export function layoutPieSlices(model: SupportedChartModel): readonly PieSlice[] {
  const { points: values, fractions } = chartPieData(model.series[0]);
  return chartPieSlices(values, fractions, model.firstSliceAngle ?? model.threeD?.rotationY ?? 0);
}

export function pieArcPath(cx: number, cy: number, outerRadius: number, startAngle: number, endAngle: number, innerRadius = 0): string {
  if (![cx, cy, outerRadius, startAngle, endAngle, innerRadius].every(Number.isFinite) || outerRadius <= 0 || innerRadius < 0 || innerRadius >= outerRadius) {
    throw new RangeError("Pie arc geometry is invalid.");
  }
  const point = (radius: number, angle: number) => ({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  const outerStart = point(outerRadius, startAngle);
  const outerEnd = point(outerRadius, endAngle);
  if (endAngle - startAngle >= Math.PI * 2 - 1e-9) {
    const middleAngle = startAngle + Math.PI;
    const outerMiddle = point(outerRadius, middleAngle);
    if (innerRadius === 0) {
      return `M ${outerStart.x} ${outerStart.y} A ${outerRadius} ${outerRadius} 0 1 1 ${outerMiddle.x} ${outerMiddle.y} A ${outerRadius} ${outerRadius} 0 1 1 ${outerStart.x} ${outerStart.y} Z`;
    }
    const innerStart = point(innerRadius, startAngle);
    const innerMiddle = point(innerRadius, middleAngle);
    return `M ${outerStart.x} ${outerStart.y} A ${outerRadius} ${outerRadius} 0 1 1 ${outerMiddle.x} ${outerMiddle.y} A ${outerRadius} ${outerRadius} 0 1 1 ${outerStart.x} ${outerStart.y} L ${innerStart.x} ${innerStart.y} A ${innerRadius} ${innerRadius} 0 1 0 ${innerMiddle.x} ${innerMiddle.y} A ${innerRadius} ${innerRadius} 0 1 0 ${innerStart.x} ${innerStart.y} Z`;
  }
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  if (innerRadius === 0) return `M ${cx} ${cy} L ${outerStart.x} ${outerStart.y} A ${outerRadius} ${outerRadius} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y} Z`;
  const innerEnd = point(innerRadius, endAngle);
  const innerStart = point(innerRadius, startAngle);
  return `M ${outerStart.x} ${outerStart.y} A ${outerRadius} ${outerRadius} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${innerStart.x} ${innerStart.y} Z`;
}

function categoryLabels(model: SupportedChartModel, count: number): readonly string[] {
  const primary = indexChartSequence(model.series.find(series => series.categories !== undefined)?.categories);
  return Object.freeze(Array.from({ length: count }, (_, index) => String(primary.get(index) ?? index + 1)));
}

function linearTicks(minimum: number, maximum: number, count: number): readonly number[] {
  const range = maximum - minimum;
  const rawStep = range / Math.max(1, count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const first = Math.ceil(minimum / step) * step;
  const ticks: number[] = [];
  for (let index = 0; index < 100; index++) {
    const value = first + index * step;
    if (value > maximum + step * 1e-9) break;
    const tick = roundChartTick(value, step);
    if (ticks.length === 0 || tick > ticks[ticks.length - 1]!) ticks.push(tick);
  }
  if (ticks.length === 0) return Object.freeze([minimum, maximum]);
  return Object.freeze(ticks);
}

function numericDomain(values: readonly number[], explicitMinimum: number | undefined, explicitMaximum: number | undefined): { readonly minimum: number; readonly maximum: number } {
  let minimum = explicitMinimum ?? Math.min(...values);
  let maximum = explicitMaximum ?? Math.max(...values);
  if (!Number.isFinite(minimum)) minimum = 0;
  if (!Number.isFinite(maximum)) maximum = 1;
  if (minimum > maximum) [minimum, maximum] = [maximum, minimum];
  if (minimum === maximum) {
    const expansion = Math.max(1, Math.abs(minimum) * 0.05);
    if (explicitMinimum === undefined) minimum -= expansion;
    if (explicitMaximum === undefined) maximum += expansion;
  } else {
    const padding = (maximum - minimum) * 0.05;
    if (explicitMinimum === undefined) minimum -= padding;
    if (explicitMaximum === undefined) maximum += padding;
  }
  if (minimum === maximum) maximum = minimum + 1;
  return Object.freeze({ minimum, maximum });
}

function numericPoints(sequence: ChartDataSequence | undefined): ReadonlyMap<number, number> {
  return new Map(sequence?.points.flatMap((point) =>
    typeof point.value === "number" ? [[point.index, point.value] as const] : []
  ) ?? []);
}

function numericSequence(
  source: ChartDataSequence | undefined,
  points: readonly { readonly index: number; readonly value: number }[],
): ChartDataSequence {
  return Object.freeze({
    kind: "number",
    formula: source?.formula,
    formatCode: source?.formatCode,
    points: Object.freeze(points.map((point) => Object.freeze(point))),
  });
}

function finiteSize(value: number, context: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${context} must be a positive finite number.`);
}

/** Positive and negative values form separate stacks; percent stacks normalize each category. */
export function cartesianStack(model: SupportedChartModel, seriesIndex: number, category: number) {
 const series=model.series[seriesIndex]; if(!series)return;
 const raw=chartSequenceValue(series.values,category); if(typeof raw!=="number")return;
 if(model.grouping!=="stacked" && model.grouping!=="percent-stacked")return {start:0,end:raw};
 const values=model.series.map(s=>chartSequenceValue(s.values,category)).map(v=>typeof v==="number"?v:0);
 const total=values.reduce((n,v)=>n+Math.abs(v),0);
 const scale=model.grouping==="percent-stacked" ? total ? 1/total : 0 : 1;
 const start=values.slice(0,seriesIndex).filter(v=>(v>=0)===(raw>=0)).reduce((n,v)=>n+v,0)*scale;
 return {start,end:start+raw*scale};
}
