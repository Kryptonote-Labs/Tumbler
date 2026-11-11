import type { ChartAxis } from './model.ts';
import { chartAxisTicks } from './axis-scale.ts';

const DAY = 86400000;
function date(serial: number, epoch: '1900' | '1904'): Date {
  return new Date((epoch === '1904' ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31)) + (serial - (epoch === '1900' && serial >= 60 ? 1 : 0)) * DAY);
}
function serial(value: Date, epoch: '1900' | '1904'): number {
  const days = (value.getTime() - (epoch === '1904' ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31))) / DAY;
  return days + (epoch === '1900' && days >= 60 ? 1 : 0);
}

/** Month/year axes space calendar units equally instead of treating every month as thirty days. */
export function chartDatePosition(value: number, unit: 'days' | 'months' | 'years', epoch: '1900' | '1904') {
  if (unit === 'days') return value;
  const current = date(value, epoch), year = current.getUTCFullYear(), month = current.getUTCMonth();
  if (!Number.isFinite(current.getTime())) return value;
  const start = Date.UTC(year, unit === 'months' ? month : 0, 1), end = Date.UTC(year + (unit === 'years' ? 1 : 0), unit === 'months' ? month + 1 : 0, 1);
  return (unit === 'months' ? year * 12 + month : year) + (current.getTime() - start) / (end - start);
}

export interface ChartDateScale {
  readonly minimum: number;
  readonly maximum: number;
  readonly ticks: readonly number[];
  readonly values: readonly (number | undefined)[];
}

export function chartDateScale(values: readonly (number | undefined)[], axis: ChartAxis, epoch: '1900' | '1904', between: boolean): ChartDateScale {
  const present = values.filter((value): value is number => value !== undefined && Number.isFinite(value));
  let minimum = axis.minimum ?? (present.length ? Math.min(...present) : 0), maximum = axis.maximum ?? (present.length ? Math.max(...present) : 1);
  if (maximum <= minimum) maximum = minimum + 1;
  const interval = axis.majorUnit ?? Math.max(1, Math.ceil((maximum - minimum) / 8));
  const unit = axis.majorUnit === undefined ? maximum - minimum > 730 ? 'years' : maximum - minimum > 120 ? 'months' : 'days' : axis.majorTimeUnit ?? 'days';
  let ticks: readonly number[];
  if (unit === 'days') ticks = chartAxisTicks(minimum, maximum, interval);
  else {
    const first = date(minimum, epoch);
    const monthCount = (date(maximum, epoch).getUTCFullYear() - first.getUTCFullYear()) * 12 + date(maximum, epoch).getUTCMonth() - first.getUTCMonth();
    const step = axis.majorUnit ?? Math.max(1, Math.ceil(monthCount / (unit === 'years' ? 12 : 1) / 8));
    const count = Math.floor(monthCount / (unit === 'years' ? 12 : 1) / step) + 1;
    const stride = Math.max(1, Math.ceil(count / 1000));
    const result: number[] = [];
    for (let index = 0; index < count; index += stride) {
      const targetMonth = first.getUTCMonth() + index * step * (unit === 'years' ? 12 : 1);
      const lastDay = new Date(Date.UTC(first.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
      const value = serial(new Date(Date.UTC(first.getUTCFullYear(), targetMonth, Math.min(first.getUTCDate(), lastDay))), epoch);
      if (value <= maximum) result.push(value);
    }
    ticks = result;
  }
  const base = axis.baseTimeUnit ?? 'days';
  const mappedMinimum = chartDatePosition(minimum, base, epoch), mappedMaximum = chartDatePosition(maximum, base, epoch);
  return { minimum: mappedMinimum - (between && axis.minimum === undefined ? .5 : 0), maximum: mappedMaximum + (between && axis.maximum === undefined ? .5 : 0), ticks, values };
}
