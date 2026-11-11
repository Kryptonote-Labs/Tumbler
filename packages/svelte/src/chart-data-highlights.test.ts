import { expect, test } from 'bun:test';
import { bindChartData, createOoxmlChart, readChartData } from '@tumblerjs/charts';
import { createChartWorkbook } from '@tumblerjs/sheets';
import { chartDataHighlights } from './chart-data-highlights.ts';

test('mini-sheet highlights follow actual source ranges and the current sheet', () => {
  const source = createOoxmlChart({ type: 'barChart', categories: ['A', 'B'], series: [{ name: 'One', values: [1, 2] }, { name: 'Two', values: [3, 4] }] });
  const bound = createChartWorkbook(source);
  const sheet = bound.artifact.activeSheet.name;
  const highlights = chartDataHighlights(bound.source, sheet.toUpperCase(), { accent1: '#123456', accent2: '#654321' });
  expect(highlights.filter(entry => entry.color === '#123456')).toHaveLength(2);
  expect(highlights.filter(entry => entry.color === '#654321')).toHaveLength(2);
  expect(highlights.filter(entry => entry.color === '#a0a0a0')).toHaveLength(1);
  expect(chartDataHighlights(bound.source, 'Another sheet')).toEqual([]);
});

test('overlapping source roles are highlighted once and external references are left intact', () => {
  const source = createOoxmlChart({ type: 'scatterChart', categories: [], series: [{ name: 'One', values: [1, 2], xValues: [3, 4] }] });
  const data = readChartData(source);
  const bound = bindChartData(source, data.map(plot => ({ ...plot, series: plot.series.map(series => ({ ...series, nameFormula: '[Other.xlsx]Data!$B$1', xValues: { ...series.xValues!, formula: 'Data!$B$2:$B$3' }, values: { ...series.values!, formula: 'Data!$B$2:$B$3' } })) })));
  expect(chartDataHighlights(bound, 'Data')).toHaveLength(1);
  expect(readChartData(bound)[0]?.series[0]?.nameFormula).toBe('[Other.xlsx]Data!$B$1');
});
