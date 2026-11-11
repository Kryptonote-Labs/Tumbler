import { chartAxisTicks, chartLogarithmicScale, roundChartTick } from './axis-scale.ts';
import type { ChartAxis } from './model.ts';

/** Automatic bounds include bubble footprints; authored bounds still clip exactly where requested. */
export function fitBubbleAxis(minimum: number, maximum: number, values: readonly number[], axis: ChartAxis | undefined, radius: number, length: number, labelSize: number, includeZero = false) {
  const log = axis?.logBase, transform = (value: number) => log ? Math.log(value) / Math.log(log) : value;
  const restore = (value: number) => log ? Math.min(Number.MAX_VALUE, Math.max(Number.MIN_VALUE, log ** value)) : value;
  let low = transform(minimum), high = transform(maximum);
  const data = values.filter(value => Number.isFinite(value) && (!log || value > 0)).map(transform);
  if (!data.length) return { minimum, maximum, ticks: log ? chartLogarithmicScale([], { ...axis!, minimum, maximum }).ticks : chartAxisTicks(minimum, maximum, axis?.majorUnit) };
  const first = Math.min(...data), last = Math.max(...data), fraction = radius / length;
  if (!log && includeZero) {
    if (axis?.minimum === undefined && low > 0 && low < high * 5 / 6) low = 0;
    if (axis?.maximum === undefined && high < 0 && high > low * 5 / 6) high = 0;
  }
  const initial = log ? [] : chartAxisTicks(low, high, axis?.majorUnit, { length, labelSize });
  const step = log ? 1 : axis?.majorUnit ?? (initial.length > 1 ? initial[1]! - initial[0]! : high - low || 1);
  if (!(fraction >= 0 && fraction < .5) || !(step > 0)) throw new RangeError('Invalid bubble axis geometry.');
  // At most 30% of the shorter plot dimension; rounded bounds converge rapidly below 50%.
  for (let iteration = 0; iteration < 8; iteration++) {
    const previousLow = low, previousHigh = high;
    if (axis?.minimum === undefined) low = Math.floor(Math.min(low, (first - fraction * high) / (1 - fraction)) / step) * step;
    if (axis?.maximum === undefined) high = Math.ceil(Math.max(high, (last - fraction * low) / (1 - fraction)) / step) * step;
    if (low === previousLow && high === previousHigh) break;
  }
  minimum = log ? restore(low) : roundChartTick(low, step);
  maximum = log ? restore(high) : roundChartTick(high, step);
  return { minimum, maximum, ticks: log ? chartLogarithmicScale(values, { ...axis!, minimum, maximum }).ticks : chartAxisTicks(minimum, maximum, step) };
}
