import { expect, test } from 'bun:test';
import { createOoxmlChart, convertChartType, readChartData, parseOoxmlChart, OOXML_CHART_TYPES, updateChartData } from '../src/index.ts';

const options = { type: 'barChart' as const, categories: ['A', 'B', 'C'], series: [{ name: 'High', values: [10, 12, 9] }, { name: 'Low', values: [3, 4, 2] }, { name: 'Close', values: [7, 8, 6] }] };
for (const type of OOXML_CHART_TYPES) {
  test(`convert column to ${type} retains values and the original theme fill`, () => {
    const converted = convertChartType(createOoxmlChart(options), { type });
    expect(parseOoxmlChart(converted, 'transitional')).toMatchObject({ status: 'supported', sourceType: type });
    expect(readChartData(converted)[0]?.series.map(series => series.values?.values)).toEqual(options.series.map(series => series.values));
    expect(new TextDecoder().decode(converted)).toContain('<a:schemeClr val="accent1"/>');
  });
}

test('type conversion restores inactive per-series properties and retains later data edits', () => {
  let bytes = createOoxmlChart({ ...options, type: 'lineChart' });
  const xml = new TextDecoder().decode(bytes).replace('<c:cat>', '<c:marker><c:symbol val="diamond"/><c:size val="12"/></c:marker><c:cat>');
  bytes = convertChartType(new TextEncoder().encode(xml), { type: 'pieChart' });
  bytes = updateChartData(bytes, readChartData(bytes).map(plot => ({ ...plot, series: plot.series.map(series => ({ ...series, values: { ...series.values!, values: [4, 5, 6] } })) })));
  const restored = convertChartType(bytes, { type: 'lineChart' });
  const parsed = parseOoxmlChart(restored, 'transitional');
  expect(parsed.status).toBe('supported');
  if (parsed.status !== 'supported') return;
  expect(parsed.series[0]?.marker).toEqual({ symbol: 'diamond', size: 12 });
  expect(parsed.series[0]?.values?.points.map(point => point.value)).toEqual([4, 5, 6]);
});

test('XY conversion preserves existing numeric source references', () => {
  const bytes = createOoxmlChart({ ...options, type: 'scatterChart', series: options.series.map(series => ({ ...series, xValues: [3, 8, 12] })) });
  const column = convertChartType(bytes, { type: 'barChart' });
  expect(readChartData(column)[0]?.series[0]?.categories?.values).toEqual([3, 8, 12]);
  const restored = convertChartType(column, { type: 'scatterChart' });
  expect(readChartData(restored)[0]?.series[0]?.xValues?.values).toEqual([3, 8, 12]);
});
