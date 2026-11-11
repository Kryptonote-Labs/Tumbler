import { expect, test } from 'bun:test';
import { createOoxmlChart, editChartSeries, chartPropertyTree } from '@tumblerjs/charts';
import { chartFormatTargets } from '../src/chart-properties.ts';

test('a chart formatting selection follows its native series through reordering', () => {
  const bytes = createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'One', values: [2] }, { name: 'Two', values: [3] }] });
  const selected = chartFormatTargets(chartPropertyTree(bytes)).find(target => target.label === 'One')!;
  const moved = editChartSeries(bytes, { action: 'move', series: 1, to: 0 });
  expect(chartFormatTargets(chartPropertyTree(moved)).find(target => target.key === selected.key)?.label).toBe('One');
  const removed = editChartSeries(moved, { action: 'remove', series: 1 });
  expect(chartFormatTargets(chartPropertyTree(removed)).find(target => target.key === selected.key)).toBeUndefined();
});
