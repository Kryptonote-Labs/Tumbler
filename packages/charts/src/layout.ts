import type { ChartDataSequence, SupportedChartModel } from "./model.ts";

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
  const values = model.series.flatMap((series) => series.values?.points.flatMap((point) =>
    typeof point.value === "number" ? [point.value] : []
  ) ?? []);
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

function finiteSize(value: number, context: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${context} must be a positive finite number.`);
}
