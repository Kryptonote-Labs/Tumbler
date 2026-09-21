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

export function layoutCartesianChart(model: SupportedChartModel, width: number, height: number): CartesianChartLayout {
  finiteSize(width, "chart width");
  finiteSize(height, "chart height");
  const titleHeight = model.title === undefined ? 10 : Math.min(34, Math.max(20, height * 0.12));
  const legend = model.legend?.overlay === false ? model.legend.position : undefined;
  const leftLegend = legend === "left" ? Math.min(100, width * 0.22) : 0;
  const rightLegend = legend === "right" || legend === "top-right" ? Math.min(100, width * 0.22) : 0;
  const topLegend = legend === "top" ? 24 : 0;
  const bottomLegend = legend === "bottom" ? 28 : 0;
  const horizontal = model.kind === "bar";
  const plot = Object.freeze({
    x: leftLegend + (horizontal ? 76 : 48),
    y: titleHeight + topLegend + 8,
    width: Math.max(1, width - leftLegend - rightLegend - (horizontal ? 88 : 62)),
    height: Math.max(1, height - titleHeight - topLegend - bottomLegend - (horizontal ? 28 : 42)),
  });
  const categories = categoryLabels(model);
  const axis = model.axes.find((candidate) => candidate.kind === "value" && !candidate.deleted);
  const values = model.series.flatMap((_, series) => categories.flatMap((_, index) => {
    const point = cartesianStack(model,series,index);
    return point ? [point.start,point.end] : [];
  }));
  let minimum = axis?.minimum ?? Math.min(0, ...values);
  let maximum = axis?.maximum ?? Math.max(0, ...values);
  if (!Number.isFinite(minimum)) minimum = 0;
  if (!Number.isFinite(maximum)) maximum = 1;
  if (minimum === maximum) {
    const expansion = Math.max(1, Math.abs(minimum) * 0.1);
    minimum -= expansion;
    maximum += expansion;
  }
  if (minimum > maximum) [minimum, maximum] = [maximum, minimum];
  return Object.freeze({ plot, categories, minimum, maximum, ticks: linearTicks(minimum, maximum, 5) });
}

/** Lays out paired numeric X/Y values without converting them to category positions. */
export function layoutScatterChart(model: SupportedChartModel, width: number, height: number): ScatterChartLayout {
  finiteSize(width, "chart width");
  finiteSize(height, "chart height");
  const titleHeight = model.title === undefined ? 10 : Math.min(34, Math.max(20, height * 0.12));
  const legend = model.legend?.overlay === false ? model.legend.position : undefined;
  const leftLegend = legend === "left" ? Math.min(100, width * 0.22) : 0;
  const rightLegend = legend === "right" || legend === "top-right" ? Math.min(100, width * 0.22) : 0;
  const topLegend = legend === "top" ? 24 : 0;
  const bottomLegend = legend === "bottom" ? 28 : 0;
  const plot = Object.freeze({
    x: leftLegend + 58,
    y: titleHeight + topLegend + 8,
    width: Math.max(1, width - leftLegend - rightLegend - 76),
    height: Math.max(1, height - titleHeight - topLegend - bottomLegend - 48),
  });
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
    return id === undefined ? undefined : model.axes.find((axis) => axis.id === id && !axis.deleted);
  };
  const visibleValueAxes = model.axes.filter((axis) => axis.kind === "value" && !axis.deleted);
  const xAxis = axisById(0) ?? visibleValueAxes.find((axis) => axis.position === "bottom" || axis.position === "top");
  const yAxis = axisById(1) ?? visibleValueAxes.find((axis) => axis.position === "left" || axis.position === "right");
  const xDomain = numericDomain(xValues, xAxis?.minimum, xAxis?.maximum);
  const yDomain = numericDomain(yValues, yAxis?.minimum, yAxis?.maximum);
  const series = rawSeries.map((points) => Object.freeze(points.map((point) => Object.freeze({
    ...point,
    plotX: chartValueCoordinate(point.x, xDomain.minimum, xDomain.maximum, plot.x, plot.width),
    plotY: chartValueCoordinate(point.y, yDomain.minimum, yDomain.maximum, plot.y, plot.height, true),
  }))));
  return Object.freeze({
    plot,
    xMinimum: xDomain.minimum,
    xMaximum: xDomain.maximum,
    yMinimum: yDomain.minimum,
    yMaximum: yDomain.maximum,
    xTicks: linearTicks(xDomain.minimum, xDomain.maximum, 5),
    yTicks: linearTicks(yDomain.minimum, yDomain.maximum, 5),
    series: Object.freeze(series),
  });
}

/** Lays out sparse X/Y/size triples with area- or width-proportional bubble radii. */
export function layoutBubbleChart(model: SupportedChartModel, width: number, height: number): BubbleChartLayout {
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
  const xy = layoutScatterChart(projectedModel, width, height);
  const visibleMagnitudes = paired.flatMap((points) => points.flatMap((point) =>
    point.size > 0 || (point.size < 0 && model.showNegativeBubbles === true) ? [Math.abs(point.size)] : []
  ));
  const maximumMagnitude = Math.max(1, ...visibleMagnitudes);
  const maximumRadius = Math.min(xy.plot.width, xy.plot.height) * 0.1 * (model.bubbleScale ?? 100) / 100;
  const series = paired.map((points, seriesIndex) => {
    const xyByIndex = new Map((xy.series[seriesIndex] ?? []).map((point) => [point.index, point] as const));
    return Object.freeze(points.map((point): BubblePoint => {
      const position = xyByIndex.get(point.index)!;
      const magnitude = Math.abs(point.size);
      const visible = point.size > 0 || (point.size < 0 && model.showNegativeBubbles === true);
      const ratio = visible ? magnitude / maximumMagnitude : 0;
      const radius = maximumRadius * (model.bubbleSizeRepresentation === "width" ? ratio : Math.sqrt(ratio));
      return Object.freeze({ ...position, size: point.size, radius, negative: point.size < 0 });
    }));
  });
  return Object.freeze({ ...xy, series: Object.freeze(series) });
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
  const values = model.series[0]?.values?.points.flatMap((point) =>
    typeof point.value === "number" && point.value > 0 ? [{ index: point.index, value: point.value }] : []
  ) ?? [];
  const total = values.reduce((sum, point) => sum + point.value, 0);
  if (total <= 0) return Object.freeze([]);
  let angle = -Math.PI / 2;
  return Object.freeze(values.map((point) => {
    const startAngle = angle;
    angle += point.value / total * Math.PI * 2;
    return Object.freeze({ ...point, startAngle, endAngle: angle });
  }));
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

function categoryLabels(model: SupportedChartModel): readonly string[] {
  const maximumIndex = Math.max(-1, ...model.series.flatMap((series) => [
    ...(series.categories?.points.map((point) => point.index) ?? []),
    ...(series.values?.points.map((point) => point.index) ?? []),
  ]));
  const primary = model.series.find((series) => series.categories !== undefined)?.categories;
  return Object.freeze(Array.from({ length: maximumIndex + 1 }, (_, index) => String(chartSequenceValue(primary, index) ?? index + 1)));
}

function linearTicks(minimum: number, maximum: number, count: number): readonly number[] {
  const range = maximum - minimum;
  const rawStep = range / Math.max(1, count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const first = Math.ceil(minimum / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= maximum + step * 1e-9 && ticks.length < 100; value += step) ticks.push(Object.is(value, -0) ? 0 : value);
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
