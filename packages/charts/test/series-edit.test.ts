import { expect, test } from 'bun:test';
import { createOoxmlChart, editChartSeries, readChartData, inspectChartSource } from '../src/index.ts';
const source = createOoxmlChart({ type: 'barChart', categories: ['A', 'B'], series: [{ name: 'One', values: [2, 4] }, { name: 'Two', values: [3, 5] }] });

test('adding, duplicating, reordering and removing series retain data and unique identities', () => {
  const added = editChartSeries(source, { action: 'add', series: { name: 'Three', categories: { kind: 'string', values: ['A', 'B'] }, values: { kind: 'number', values: [6, 7], formula: "'Data'!$D$2:$D$3" } } });
  const duplicated = editChartSeries(added, { action: 'duplicate', series: 1 });
  expect(readChartData(duplicated)[0]?.series.map(series => series.index)).toEqual([0, 1, 2, 3]);
  const reordered = editChartSeries(duplicated, { action: 'move', series: 2, to: 0 });
  expect(readChartData(reordered)[0]?.series.map(series => series.name)).toEqual(['Three', 'One', 'Two', 'Two']);
  expect(readChartData(reordered)[0]?.series[0]?.values?.formula).toBe("'Data'!$D$2:$D$3");
  const removed = editChartSeries(reordered, { action: 'remove', series: 1 });
  expect(readChartData(removed)[0]?.series.map(series => series.index)).toEqual([2, 1, 3]);
  expect(inspectChartSource(removed).namespace).toContain('/chart');
});

test('duplicating and moving retain namespace bindings declared on their plot', () => {
  const text = new TextDecoder().decode(source).replace('<c:barChart>', '<c:barChart xmlns:test="urn:series-test">').replace('<c:ser>', '<c:ser test:label="keep">');
  for (const edit of [{ action: 'duplicate', series: 0 }, { action: 'move', series: 0, to: 1 }] as const) {
    const result = new TextDecoder().decode(editChartSeries(new TextEncoder().encode(text), edit));
    expect(result).toContain('test:label="keep"');
    expect(result).toContain('xmlns:test="urn:series-test"');
  }
});
