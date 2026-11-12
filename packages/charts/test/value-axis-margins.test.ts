import { expect, test } from 'bun:test';
import { createOoxmlChart, parseOoxmlChart, layoutChartScene, layoutCartesianChart, type ChartMark } from '../src/index.ts';

function chart() {
  const parsed = parseOoxmlChart(createOoxmlChart({ type: 'barChart', categories: ['Jan', 'Feb', 'Mar'], series: [{ name: 'Sales', values: [10000, 30000, 50000] }] }), 'transitional');
  if (parsed.status !== 'supported') throw new Error(parsed.reason);
  return parsed;
}
const flat = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flat(mark.marks) : [mark]);
const measure = (text: string) => text.length * 8;
const numbers = (marks: readonly ChartMark[]) => flat(marks).filter((mark): mark is Extract<ChartMark, { kind: 'text' }> => mark.kind === 'text' && /^\d|^USD/.test(mark.text));

test('automatic value labels fit within the chart instead of clipping large spreadsheet values', () => {
  const scene = layoutChartScene(chart(), 560, 360, { measureText: measure });
  const labels = numbers(scene.marks);
  expect(labels.some(label => label.text === '50,000')).toBe(true);
  for (const label of labels) expect(label.x - measure(label.text)).toBeGreaterThanOrEqual(6);
});

test('right-side labels reserve space on the right and preserve the data domain', () => {
  const original = chart();
  const right = { ...original, axes: original.axes.map(axis => axis.kind === 'value' ? { ...axis, position: 'right' as const, tickLabelPosition: 'high' as const } : axis) };
  const labels = numbers(layoutChartScene(right, 560, 360, { measureText: measure }).marks);
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) expect(label.x + measure(label.text)).toBeLessThanOrEqual(554);
  expect(layoutCartesianChart(right, 560, 360).maximum).toBe(layoutCartesianChart(original, 560, 360).maximum);
});

test('margin measurement uses the same host formatter as the painted labels', () => {
  const scene = layoutChartScene(chart(), 560, 360, { measureText: measure, formatNumber: value => `USD ${value.toFixed(2)}` });
  const labels = numbers(scene.marks);
  expect(labels.some(label => label.text === 'USD 50000.00')).toBe(true);
  for (const label of labels) expect(label.x - measure(label.text)).toBeGreaterThanOrEqual(6);
});

test('manual plot coordinates remain authored and hidden labels do not reserve space', () => {
  const original = chart();
  const manual = { ...original, plotLayout: { target: 'inner' as const, xMode: 'edge' as const, x: .02, yMode: 'edge' as const, y: .1, widthMode: 'factor' as const, width: .8, heightMode: 'factor' as const, height: .8 } };
  expect(layoutCartesianChart(manual, 560, 360).plot.x).toBeCloseTo(11.2);
  const hidden = { ...original, axes: original.axes.map(axis => axis.kind === 'value' ? { ...axis, tickLabelPosition: 'none' as const } : axis) };
  expect(layoutCartesianChart(hidden, 560, 360, measure).plot.x).toBe(30);
  expect(layoutCartesianChart(original, 560, 360, measure).plot.x).toBeGreaterThan(30);
});


test('automatic category labels rotate and reserve height after wide value labels narrow the plot', () => {
  const model = chart(), options = { formatNumber: (value: number) => `USD ${value.toFixed(2)}` };
  const fitted = layoutCartesianChart(model, 180, 240, measure, options);
  expect(fitted.categoryRotation).toBe(-45);
  const authored = { ...model, axes: model.axes.map(axis => axis.kind === 'category' ? { ...axis, labelRotation: 0 } : axis) };
  const explicit = layoutCartesianChart(authored, 180, 240, measure, options);
  expect(explicit.categoryRotation).toBe(0);
  expect(fitted.plot.height).toBeLessThan(explicit.plot.height);
});
