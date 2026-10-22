import type { ChartDataSequence, SupportedChartModel } from './model.ts';

/** Build once per layout so host-edited sequences cannot retain stale cached values. */
export function indexChartSequence(sequence: ChartDataSequence | undefined): ReadonlyMap<number, string | number> {
  const values = new Map<number, string | number>();
  for (const point of sequence?.points ?? []) if (!values.has(point.index)) values.set(point.index, point.value);
  return values;
}

export interface StackPoint { readonly start: number; readonly end: number }

/** Each category visits each series twice, preserving separate positive and negative stacks. */
export function chartStacks(model: SupportedChartModel, count: number): readonly (readonly (StackPoint | undefined)[])[] {
  const indexed = model.series.map(series => indexChartSequence(series.values));
  const result = model.series.map(() => Array<StackPoint | undefined>(count));
  const stacked = model.grouping === 'stacked' || model.grouping === 'percent-stacked';
  for (let category = 0; category < count; category++) {
    let total = 0;
    if (model.grouping === 'percent-stacked') for (const values of indexed) {
      const value = values.get(category);
      if (typeof value === 'number') total += Math.abs(value);
    }
    const scale = model.grouping === 'percent-stacked' ? total ? 1 / total : 0 : 1;
    let positive = 0, negative = 0;
    for (let s = 0; s < indexed.length; s++) {
      const raw = indexed[s]!.get(category);
      if (typeof raw !== 'number') continue;
      const start = stacked ? (raw >= 0 ? positive : negative) * scale : 0;
      result[s]![category] = { start, end: start + raw * scale };
      if (raw >= 0) positive += raw; else negative += raw;
    }
  }
  return result;
}
