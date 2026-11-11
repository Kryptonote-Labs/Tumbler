import type { ChartAxis } from "./model.ts";

/** Layout-space measurements, independent of document zoom and device pixel ratio. */
export interface ChartAxisSpace {
  readonly length: number;
  readonly labelSize: number;
}

/** Word reduces automatic grid density when labels have less room. Explicit units bypass this. */
function automaticIntervals(space?: ChartAxisSpace): number {
  if (!space) return 5;
  if (!Number.isFinite(space.length) || space.length <= 0 || !Number.isFinite(space.labelSize) || space.labelSize <= 0)
    throw new RangeError('Axis length and label size must be positive and finite.');
  // Office retains three intervals in compact plots; larger plots accommodate denser grids.
  return Math.max(3, Math.min(8, Math.round(space.length / (space.labelSize * 2))));
}

/** Automatic headroom and density follow Word reference cases; ECMA does not mandate an auto algorithm. */
export function cartesianAxisScale(minimum: number, maximum: number, axis?: ChartAxis, percentStacked = false, space?: ChartAxisSpace) {
  if (!Number.isFinite(minimum)) minimum = 0;
  if (!Number.isFinite(maximum)) maximum = 1;
  if (minimum > maximum) [minimum, maximum] = [maximum, minimum];
  if (minimum === maximum) {
    if (axis?.maximum === undefined) maximum += Math.max(1, Math.abs(maximum) * 0.1);
    else minimum -= Math.max(1, Math.abs(minimum) * 0.1);
  }
  const step = axis?.majorUnit ?? niceStep((maximum - minimum) / automaticIntervals(space));
  if (!Number.isFinite(step) || step <= 0) throw new RangeError("Axis major unit must be positive and finite.");
  if (!percentStacked) {
    const padding = (maximum - minimum) * 0.05;
    if (axis?.minimum === undefined && minimum < 0) minimum = Math.floor((minimum - padding) / step) * step;
    if (axis?.maximum === undefined && maximum > 0) maximum = Math.ceil((maximum + padding) / step) * step;
  }
  return { minimum, maximum, ticks: chartAxisTicks(minimum, maximum, step) };
}

/** Tick positions begin at the axis minimum. Dense authored grids are sampled on whole major units. */
export function chartAxisTicks(minimum: number, maximum: number, majorUnit?: number, space?: ChartAxisSpace): readonly number[] {
  const step = majorUnit ?? niceStep((maximum - minimum) / automaticIntervals(space));
  if (!Number.isFinite(step) || step <= 0) throw new RangeError("Axis major unit must be positive and finite.");
  const intervals = (maximum - minimum) / step;
  if (!Number.isFinite(intervals)) return Object.freeze([minimum]);
  const stride = Math.max(1, Math.ceil(intervals / 1000));
  const count = Math.floor(intervals / stride + 1e-9) + 1;
  const ticks = Array.from({ length: Math.max(0, count) }, (_, i) => {
    const value = minimum + i * stride * step;
    return roundChartTick(value, step);
  });
  return Object.freeze(ticks.filter((tick, i) => i === 0 || tick > ticks[i - 1]!));
}

/** Remove arithmetic noise only when rounding is negligible beside the tick step. */
export function roundChartTick(value: number, step: number): number {
  const rounded = Number(value.toPrecision(14));
  const tick = Math.abs(rounded - value) < step * 1e-6 ? rounded : value;
  return Object.is(tick, -0) ? 0 : tick;
}

function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

/** Logarithmic bounds are positive and use the authored base; automatic bounds span whole powers. */
export function chartLogarithmicScale(values: readonly number[], axis: ChartAxis) {
  const base = axis.logBase ?? 10;
  const positive = values.filter(value => Number.isFinite(value) && value > 0);
  const power = (exponent: number) => Math.min(Number.MAX_VALUE, Math.max(Number.MIN_VALUE, base ** exponent));
  let minimum = axis.minimum !== undefined && axis.minimum > 0 ? axis.minimum : positive.length ? power(Math.floor(Math.log(Math.min(...positive)) / Math.log(base))) : 1;
  let maximum = axis.maximum !== undefined && axis.maximum > minimum ? axis.maximum : positive.length ? power(Math.ceil(Math.log(Math.max(...positive)) / Math.log(base))) : base;
  if (!(maximum > minimum)) {
    maximum = Math.min(Number.MAX_VALUE, minimum * base);
    if (!(maximum > minimum) && axis.minimum === undefined) minimum = maximum / base;
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || !(minimum > 0 && maximum > minimum)) throw new RangeError('Logarithmic chart bounds must span finite positive values.');
  const ticks: number[] = [];
  const first = Math.ceil(Math.log(minimum) / Math.log(base) - 1e-12), last = Math.floor(Math.log(maximum) / Math.log(base) + 1e-12);
  const stride = Math.max(1, Math.ceil((last - first) / 1000));
  const count = Math.max(0, Math.floor((last - first) / stride) + 1);
  for (let index = 0; index < count; index++) {
    const value = power(first + index * stride);
    ticks.push(roundChartTick(value, value * 1e-12));
  }
  return { minimum, maximum, ticks };
}

/** Unlike clamped frame coordinates, series geometry extends past the domain and is clipped by the plot. */
export function chartAxisCoordinate(value: number, minimum: number, maximum: number, start: number, length: number, axis?: ChartAxis, vertical = false): number {
  const transform = (number: number) => axis?.logBase ? Math.log(Math.max(Number.MIN_VALUE, number)) / Math.log(axis.logBase) : number;
  const first = transform(minimum), last = transform(maximum);
  const ratio = (transform(value) - first) / (last - first);
  return start + ((vertical !== !!axis?.reversed) ? 1 - ratio : ratio) * length;
}

export function chartMinorTicks(minimum: number, maximum: number, axis: ChartAxis, major: readonly number[]): readonly number[] {
  if (axis.logBase) {
    const base = axis.logBase;
    const values: number[] = [];
    const first = Math.floor(Math.log(minimum) / Math.log(base));
    for (let exponent = first; exponent <= Math.ceil(Math.log(maximum) / Math.log(base)) && values.length < 1000; exponent++) {
      for (let factor = 2; factor < base && values.length < 1000; factor++) {
        const value = factor * base ** exponent;
        if (value > minimum && value < maximum) values.push(value);
      }
    }
    return values;
  }
  const unit = axis.minorUnit ?? (major.length > 1 ? (major[1]! - major[0]!) / 5 : (maximum - minimum) / 25);
  return chartAxisTicks(minimum, maximum, unit).filter(value => !major.some(tick => Math.abs(value - tick) < unit * 1e-8));
}

/** A crossing value uses the coordinate system of the axis that owns the property. */
export function chartAxisCrossing(axis: ChartAxis | undefined, minimum: number, maximum: number): number {
  return axis?.crossesAt ?? (axis?.crosses === 'min' ? minimum : axis?.crosses === 'max' ? maximum : Math.max(minimum, Math.min(maximum, axis?.logBase ? 1 : 0)));
}
