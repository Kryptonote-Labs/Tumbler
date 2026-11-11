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

function comboFixture() {
  const base = new TextDecoder().decode(createOoxmlChart({ type: 'lineChart', categories: ['A', 'B'], series: [{ name: 'First', values: [2, 4] }] }));
  const first = base.replace('<c:cat>', '<c:marker><c:symbol val="diamond"/><c:size val="7"/></c:marker><c:cat>');
  const second = base.match(/<c:lineChart>[\s\S]*?<\/c:lineChart>/)![0].replace('<c:idx val="0"/>', '<c:idx val="1"/>').replace('<c:order val="0"/>', '<c:order val="1"/>').replace('<c:cat>', '<c:marker><c:symbol val="square"/><c:size val="7"/></c:marker><c:cat>').replace('<c:axId val="2"/>', '<c:axId val="3"/>');
  const axis = base.match(/<c:valAx>[\s\S]*?<\/c:valAx>/)![0].replace('<c:axId val="2"/>', '<c:axId val="3"/>').replace('<c:axPos val="l"/>', '<c:axPos val="r"/>').replace('<c:scaling>', '<c:scaling><c:max val="100"/>');
  return new TextEncoder().encode(first.replace('</c:lineChart>', `</c:lineChart>${second}`).replace('</c:plotArea>', `${axis}</c:plotArea>`));
}

test('converting a secondary plot keeps its authored value axis and scale', () => {
  const result = parseOoxmlChart(convertChartType(comboFixture(), { type: 'areaChart' }, 1), 'transitional');
  if (result.status !== 'supported') throw new Error(result.reason);
  expect(result.plots?.[1]?.axisIds).toEqual([1, 3]);
  expect(result.plots?.[1]?.axes.find(axis => axis.id === 3)).toMatchObject({ position: 'right', maximum: 100 });
});

test('inactive type settings belong to their own combo plot', () => {
  let bytes = convertChartType(comboFixture(), { type: 'barChart' }, 0);
  bytes = convertChartType(bytes, { type: 'pieChart' }, 1);
  bytes = convertChartType(bytes, { type: 'lineChart' }, 0);
  const plots = readChartData(bytes);
  expect(plots.map(plot => plot.type)).toEqual(['lineChart', 'pieChart']);
  const xml = new TextDecoder().decode(bytes);
  const first = xml.match(/<c:lineChart[\s\S]*?<\/c:lineChart>/)![0];
  expect(first).toContain('val="diamond"');
  expect(first).not.toContain('val="square"');
});
