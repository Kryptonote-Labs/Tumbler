import { expect, test } from 'bun:test';
import { createOoxmlChart, convertChartType, parseOoxmlChart } from '../src/index.ts';
const options = { type: 'barChart' as const, categories: ['A'], series: [{ name: 'One', values: [2] }, { name: 'Two', values: [3] }] };

test('changing from stacked to clustered bars restores clustered overlap', () => {
  let bytes = createOoxmlChart({ ...options, grouping: 'percentStacked' });
  bytes = convertChartType(bytes, { type: 'barChart', grouping: 'clustered' });
  expect(parseOoxmlChart(bytes, 'transitional')).toMatchObject({ status: 'supported', grouping: 'clustered', overlap: 0 });
});

test('a clustered gallery choice cannot restore overlap from an old stacked snapshot', () => {
  let bytes = createOoxmlChart({ ...options, grouping: 'percentStacked' });
  bytes = convertChartType(bytes, { type: 'lineChart' });
  bytes = convertChartType(bytes, { type: 'barChart', grouping: 'clustered' });
  expect(parseOoxmlChart(bytes, 'transitional')).toMatchObject({ status: 'supported', grouping: 'clustered', overlap: 0 });
});

test('custom overlap survives selecting the same grouping and a compatible round trip', () => {
  const xml = new TextDecoder().decode(createOoxmlChart(options)).replace('</c:barChart>', '<c:overlap val="35"/></c:barChart>');
  let bytes = convertChartType(new TextEncoder().encode(xml), { type: 'barChart', grouping: 'clustered' });
  expect(parseOoxmlChart(bytes, 'transitional')).toMatchObject({ status: 'supported', overlap: 35 });
  bytes = convertChartType(bytes, { type: 'lineChart' });
  bytes = convertChartType(bytes, { type: 'barChart', grouping: 'clustered' });
  expect(parseOoxmlChart(bytes, 'transitional')).toMatchObject({ status: 'supported', overlap: 35 });
});
