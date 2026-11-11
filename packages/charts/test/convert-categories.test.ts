import { expect, test } from 'bun:test';
import { createOoxmlChart, convertChartType, readChartData, updateChartData } from '../src/index.ts';

const options = { type: 'barChart' as const, categories: ['Jan', 'Feb'], series: [{ name: 'High', values: [10, 12] }, { name: 'Low', values: [3, 4] }, { name: 'Close', values: [7, 8] }] };

test('category labels survive XY plots followed by a previously unvisited chart type', () => {
  let bytes = createOoxmlChart(options);
  for (const type of ['scatterChart', 'bubbleChart', 'radarChart', 'stockChart', 'barChart'] as const) bytes = convertChartType(bytes, { type });
  expect(readChartData(bytes)[0]?.series.map(series => series.categories?.values)).toEqual(options.series.map(() => ['Jan', 'Feb']));
  expect(readChartData(bytes)[0]?.series.map(series => series.values?.values)).toEqual(options.series.map(series => series.values));
});

test('the latest category edits win over an older destination-type snapshot', () => {
  let bytes = convertChartType(createOoxmlChart(options), { type: 'lineChart' });
  bytes = updateChartData(bytes, readChartData(bytes).map(plot => ({ ...plot, series: plot.series.map(series => ({ ...series, categories: { ...series.categories!, values: ['April', 'May'] } })) })));
  bytes = convertChartType(bytes, { type: 'scatterChart' });
  bytes = convertChartType(bytes, { type: 'barChart' });
  expect(readChartData(bytes)[0]?.series.map(series => series.categories?.values)).toEqual(options.series.map(() => ['April', 'May']));
});

test('XY edits remain independent of the category labels across a round trip', () => {
  let bytes = convertChartType(createOoxmlChart(options), { type: 'scatterChart' });
  bytes = updateChartData(bytes, readChartData(bytes).map(plot => ({ ...plot, series: plot.series.map(series => ({ ...series, xValues: { ...series.xValues!, values: [3, 8] } })) })));
  bytes = convertChartType(bytes, { type: 'areaChart' });
  expect(readChartData(bytes)[0]?.series[0]?.categories?.values).toEqual(['Jan', 'Feb']);
  bytes = convertChartType(bytes, { type: 'scatterChart' });
  expect(readChartData(bytes)[0]?.series[0]?.xValues?.values).toEqual([3, 8]);
});
