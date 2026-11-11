import { expect, test } from 'bun:test';
import { createOoxmlChart, parseOoxmlChart, layoutChartScene, layoutCartesianChart, OOXML_CHART_TYPES, type ChartMark, type CreateChartOptions } from '../src/index.ts';

function model(options: Partial<CreateChartOptions> & Pick<CreateChartOptions, 'type'>) {
  const result = parseOoxmlChart(createOoxmlChart({ categories: ['A', 'B', 'C'], series: [{ name: 'One', values: [2, 4, 3] }], ...options }), 'transitional');
  if (result.status !== 'supported') throw new Error(result.reason);
  return result;
}
function flat(marks: readonly ChartMark[]): ChartMark[] { return marks.flatMap(mark => mark.kind === 'group' ? flat(mark.marks) : [mark]); }

for (const type of OOXML_CHART_TYPES) {
  test(`${type} creates finite data geometry instead of a fallback`, () => {
    const chart = model({ type, series: Array.from({ length: type === 'stockChart' ? 3 : 2 }, (_, index) => ({ name: `Series ${index}`, values: [index + 2, index + 4, index + 3], bubbleSizes: [2, 3, 4] })) });
    const scene = layoutChartScene(chart, 600, 400);
    expect(scene.label).not.toBe('Chart preview unavailable');
    const marks = flat(scene.marks);
    expect(marks.some(mark => mark.kind === 'path' || mark.kind === 'circle' || mark.kind === 'rect' && mark.fill !== '#ffffff')).toBe(true);
    expect(JSON.stringify(marks)).not.toMatch(/NaN|Infinity/);
  });
}

test('stacked area retains the lower series boundary and separates gaps', () => {
  const chart = model({ type: 'areaChart', grouping: 'stacked', series: [{ name: 'One', values: [2, 4, 3] }, { name: 'Two', values: [3, 2, 4] }] });
  const layout = layoutCartesianChart(chart, 600, 400);
  expect(layout.stacks[1]).toEqual([{ start: 2, end: 5 }, { start: 4, end: 6 }, { start: 3, end: 7 }]);
  const paths = flat(layoutChartScene(chart, 600, 400).marks).filter(mark => mark.kind === 'path' && mark.fill);
  expect(paths).toHaveLength(2);
  expect(paths.every(mark => mark.kind === 'path' && mark.d.endsWith(' Z'))).toBe(true);
});

test('radar filled versus marker variants select different geometry', () => {
  const filled = flat(layoutChartScene(model({ type: 'radarChart', radarStyle: 'filled' }), 600, 400).marks);
  const marker = flat(layoutChartScene(model({ type: 'radarChart', radarStyle: 'marker' }), 600, 400).marks);
  expect(filled.some(mark => mark.kind === 'path' && mark.fill)).toBe(true);
  expect(marker.filter(mark => mark.kind === 'circle')).toHaveLength(3);
  expect(marker.some(mark => mark.kind === 'path' && mark.fill)).toBe(false);
});

test('stock open and close select rising and falling candle bodies', () => {
  const chart = model({ type: 'stockChart', categories: ['Up', 'Down'], series: [
    { name: 'Open', values: [4, 8] }, { name: 'High', values: [10, 10] }, { name: 'Low', values: [2, 2] }, { name: 'Close', values: [8, 4] },
  ] });
  const candles = flat(layoutChartScene({ ...chart, legend: undefined }, 600, 400).marks).filter(mark => mark.kind === 'rect' && mark.stroke === '#595959');
  expect(candles).toHaveLength(2);
  expect(candles.map(mark => mark.kind === 'rect' && mark.fill)).toEqual(['#ffffff', '#595959']);
});

test('surface holes remain holes and wireframes have no filled bands', () => {
  const options = { type: 'surfaceChart' as const, categories: ['A', 'B'], series: [{ name: 'One', values: [1, 3] }, { name: 'Two', values: [4, 2] }] };
  const solid = flat(layoutChartScene(model(options), 600, 400).marks);
  const wire = flat(layoutChartScene(model({ ...options, wireframe: true }), 600, 400).marks);
  const missing = flat(layoutChartScene(model({ ...options, series: [options.series[0]!, { name: 'Two', values: [4, null] }] }), 600, 400).marks);
  expect(solid.some(mark => mark.kind === 'path' && mark.fill)).toBe(true);
  expect(wire.some(mark => mark.kind === 'path' && mark.fill)).toBe(false);
  expect(missing.filter(mark => mark.kind === 'path')).toHaveLength(0);
});

test('3D camera rotation changes data projection without changing cached values', () => {
  const chart = model({ type: 'bar3DChart' });
  const original = layoutChartScene(chart, 600, 400);
  const rotated = layoutChartScene({ ...chart, threeD: { ...chart.threeD!, rotationY: 60 } }, 600, 400);
  expect(original.marks).not.toEqual(rotated.marks);
  expect(chart.series[0]?.values?.points.map(point => point.value)).toEqual([2, 4, 3]);
});

test('multiple doughnut series draw independent concentric rings', () => {
  const one = model({ type: 'doughnutChart' });
  const two = { ...one, series: [one.series[0]!, { ...one.series[0]!, index: 1, order: 1 }] };
  const count = (marks: readonly ChartMark[]) => flat(marks).filter(mark => mark.kind === 'path' && mark.fill).length;
  expect(count(layoutChartScene(two, 600, 400).marks)).toBe(count(layoutChartScene(one, 600, 400).marks) * 2);
});
