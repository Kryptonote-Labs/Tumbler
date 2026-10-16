import type { ChartAxis } from "./model.ts";

/** Office-compatible automatic headroom; ECMA does not mandate this automatic algorithm. */
export function cartesianAxisScale(minimum: number, maximum: number, axis?: ChartAxis, percentStacked = false) {
  if (!Number.isFinite(minimum)) minimum = 0;
  if (!Number.isFinite(maximum)) maximum = 1;
  if (minimum > maximum) [minimum, maximum] = [maximum, minimum];
  if (minimum === maximum) {
    if (axis?.maximum === undefined) maximum += Math.max(1, Math.abs(maximum) * 0.1);
    else minimum -= Math.max(1, Math.abs(minimum) * 0.1);
  }
  const step = axis?.majorUnit ?? niceStep((maximum - minimum) / 5);
  if (!Number.isFinite(step) || step <= 0) throw new RangeError("Axis major unit must be positive and finite.");
  if (!percentStacked) {
    const padding = (maximum - minimum) * 0.05;
    if (axis?.minimum === undefined && minimum < 0) minimum = Math.floor((minimum - padding) / step) * step;
    if (axis?.maximum === undefined && maximum > 0) maximum = Math.ceil((maximum + padding) / step) * step;
  }
  return { minimum, maximum, ticks: chartAxisTicks(minimum, maximum, step) };
}

/** Tick positions begin at the axis minimum. Dense authored grids are sampled on whole major units. */
export function chartAxisTicks(minimum: number, maximum: number, majorUnit?: number): readonly number[] {
  const step = majorUnit ?? niceStep((maximum - minimum) / 5);
  if (!Number.isFinite(step) || step <= 0) throw new RangeError("Axis major unit must be positive and finite.");
  const intervals = (maximum - minimum) / step;
  if (!Number.isFinite(intervals)) return Object.freeze([minimum]);
  const stride = Math.max(1, Math.ceil(intervals / 1000));
  const count = Math.floor(intervals / stride + 1e-9) + 1;
  const ticks = Array.from({ length: Math.max(0, count) }, (_, i) => {
    const value = minimum + i * stride * step;
    const rounded = Number(value.toPrecision(14));
    // Remove decimal arithmetic noise only when it is negligible beside a major unit.
    return Math.abs(rounded - value) < step * 1e-6 ? rounded : value;
  });
  return Object.freeze(ticks.filter((tick, i) => i === 0 || tick > ticks[i - 1]!));
}

function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}
