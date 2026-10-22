import { expect, test } from 'bun:test';
import { cartesianStack, layoutCartesianChart, layoutChartScene, parseOoxmlChart, type SupportedChartModel } from '../src/index.ts';
import { chartStacks } from '../src/indexed-data.ts';

const xml = (index: number) => new TextEncoder().encode(`<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:val><c:numLit><c:pt idx="${index}"><c:v>5</c:v></c:pt></c:numLit></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`);
function model(): SupportedChartModel {
  const parsed = parseOoxmlChart(xml(0), 'transitional');
  if (parsed.status !== 'supported') throw Error(parsed.reason);
  return parsed;
}
function sparse(index: number): SupportedChartModel {
  const base = model();
  return { ...base, series: [{ ...base.series[0]!, values: { ...base.series[0]!.values!, points: [{ index, value: 5 }] } }] };
}

test('undeclared cache indices have an independent limit; bounded gaps keep their category positions', () => {
  for (const index of [100_000, 4294967295]) expect(() => parseOoxmlChart(xml(index), 'transitional')).toThrow('cache index');
  expect(layoutCartesianChart(sparse(2), 300, 200).categories).toEqual(['1', '2', '3']);
  for (const index of [20_000, 4294967295, -1, 1.5]) {
    let measures = 0;
    const scene = layoutChartScene(sparse(index), 300, 200, { measureText: () => { measures++; return 10; } });
    expect(scene.label).toBe('Chart preview unavailable');
    expect(scene.marks).toHaveLength(2);
    expect(measures).toBe(0);
  }
});

test('total series/category work is bounded, including combination plots', () => {
  const base = sparse(999);
  const dense = { ...base, series: Array.from({ length: 21 }, (_, index) => ({ ...base.series[0]!, index })) };
  expect(layoutChartScene(dense, 300, 200).label).toBe('Chart preview unavailable');
  const combo = { ...base, plots: [dense] };
  expect(layoutChartScene(combo, 300, 200).label).toBe('Chart preview unavailable');
});

test('stack indexing preserves signed, percent, zero and missing values', () => {
  const base = model();
  for (const grouping of ['clustered', 'stacked', 'percent-stacked'] as const) {
    const current = { ...base, grouping, series: [[3, -2, 0], [-4, 5], [2, -1, 0]].map((values, index) => ({
      ...base.series[0]!, index, values: { ...base.series[0]!.values!, points: values.map((value, index) => ({ value, index })) },
    })) };
    const stacks = chartStacks(current, 4);
    for (let s = 0; s < current.series.length; s++) for (let c = 0; c < 4; c++) expect(stacks[s]?.[c]).toEqual(cartesianStack(current, s, c));
  }
});

test('host edits are reflected on the next layout; callback and geometry failures return a bounded scene', () => {
  const base = model();
  const first = layoutChartScene(base, 300, 200);
  const updated = { ...base, series: [{ ...base.series[0]!, values: { ...base.series[0]!.values!, points: [{ index: 0, value: -5 }] } }] };
  expect(layoutChartScene(updated, 300, 200)).not.toEqual(first);
  expect(layoutChartScene(base, 300, 200, { measureText: () => { throw Error('host failure'); } }).label).toBe('Chart preview unavailable');
  expect(layoutChartScene(base, NaN, 0).marks).toHaveLength(2);
});
