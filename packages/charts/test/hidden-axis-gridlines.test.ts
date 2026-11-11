import { expect, test } from 'bun:test';
import { createOoxmlChart, layoutCartesianChart, layoutChartScene, parseOoxmlChart, type ChartMark, type CreateChartOptions } from '../src/index.ts';

const flat = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flat(mark.marks) : [mark]);
function model(type: CreateChartOptions['type']) {
  const source = createOoxmlChart({ type, categories: ['A', 'B', 'C', 'D'], series: [{ name: 'Data', values: [2, 4, 3, 1], xValues: [1, 2, 3, 4], bubbleSizes: [2, 3, 4, 1] }] });
  const parsed = parseOoxmlChart(source, 'transitional');
  if (parsed.status !== 'supported') throw new Error(parsed.reason);
  return { ...parsed, legend: undefined, axes: parsed.axes.map(axis => axis.kind === 'value' ? {
    ...axis, minimum: 0, maximum: 5, majorUnit: 1, minorUnit: .5, deleted: true,
    majorGridlines: true, minorGridlines: true, majorTickMark: 'cross' as const, minorTickMark: 'cross' as const,
    lineStyle: { color: { kind: 'rgb' as const, value: '#123456' } },
    gridlineStyle: { color: { kind: 'rgb' as const, value: '#FF0000' }, width: 1.5 },
    minorGridlineStyle: { color: { kind: 'rgb' as const, value: '#00AA00' }, dash: [4, 3] },
  } : axis) };
}

test('hidden value axes retain major and minor grids across categorical, XY, depth and radar plots', () => {
  for (const type of ['barChart', 'lineChart', 'areaChart', 'scatterChart', 'bubbleChart', 'bar3DChart', 'line3DChart', 'area3DChart', 'surface3DChart', 'radarChart'] as const) {
    const original = model(type), marks = flat(layoutChartScene(original, 600, 400).marks);
    const major = marks.filter(mark => mark.kind !== 'text' && mark.stroke === '#FF0000');
    const minor = marks.filter(mark => mark.kind !== 'text' && mark.stroke === '#00AA00');
    expect(major.length).toBeGreaterThan(0);
    expect(minor.length).toBeGreaterThan(0);
    expect(minor.every(mark => mark.strokeDash?.join(',') === '4,3')).toBe(true);
    expect(marks.some(mark => mark.kind === 'line' && mark.stroke === '#123456')).toBe(false);
    expect(marks.filter(mark => mark.kind === 'text' && /^\d/.test(mark.text))).toHaveLength(0);
  }
});

test('grid visibility and explicit no-fill strokes stay independent from axis deletion', () => {
  for (const type of ['barChart', 'scatterChart', 'bar3DChart', 'radarChart'] as const) {
    const original = model(type);
    const changed = { ...original, axes: original.axes.map(axis => axis.kind === 'value' ? { ...axis, majorGridlines: false, minorGridlineStyle: { noFill: true } } : axis) };
    const marks = flat(layoutChartScene(changed, 600, 400).marks);
    expect(marks.some(mark => mark.kind !== 'text' && ['#FF0000', '#00AA00'].includes(mark.stroke ?? ''))).toBe(false);
  }
});

test('visible radar axes honor a hidden tick-label setting while their minor polygons remain', () => {
  const original = model('radarChart');
  const changed = { ...original, axes: original.axes.map(axis => axis.kind === 'value' ? { ...axis, deleted: false, tickLabelPosition: 'none' as const } : axis) };
  const marks = flat(layoutChartScene(changed, 600, 400).marks);
  expect(marks.filter(mark => mark.kind === 'path' && mark.stroke === '#00AA00').length).toBeGreaterThan(0);
  expect(marks.filter(mark => mark.kind === 'text' && /^\d/.test(mark.text))).toHaveLength(0);
});

test('shared combination axes paint their major and minor grids once even with hidden spines', () => {
  for (const deleted of [false, true]) {
    const source = model('barChart');
    const original = { ...source, axes: source.axes.map(axis => ({ ...axis, deleted })) };
    const second = { ...original, kind: 'line' as const, sourceType: 'lineChart', series: original.series.map(series => ({ ...series, index: series.index + 10 })) };
    const alone = flat(layoutChartScene(original, 600, 400).marks);
    const combined = flat(layoutChartScene({ ...original, plots: [original, second], series: [...original.series, ...second.series] }, 600, 400).marks);
    for (const color of ['#FF0000', '#00AA00']) {
      expect(combined.filter(mark => mark.kind === 'line' && mark.stroke === color).length).toBe(alone.filter(mark => mark.kind === 'line' && mark.stroke === color).length);
    }
  }
});

test('dense radar grids use short circular paths instead of multiplying all category vertices', () => {
  const original = model('radarChart'), first = original.series[0]!;
  const points = Array.from({ length: 2000 }, (_, index) => ({ index, value: .5 }));
  const changed = { ...original, axes: original.axes.map(axis => axis.kind === 'value' ? { ...axis, minimum: 0, maximum: 1, majorUnit: .2, minorUnit: .001 } : axis),
    series: [{ ...first, categories: { kind: 'string' as const, formula: undefined, formatCode: undefined, points: points.map(point => ({ ...point, value: `C${point.index}` })) }, values: { ...first.values!, points } }] };
  const scene = layoutChartScene(changed, 600, 400), marks = flat(scene.marks);
  expect(scene.label).not.toBe('Chart preview unavailable');
  const grids = marks.filter(mark => mark.kind === 'path' && mark.stroke === '#00AA00');
  expect(grids.length).toBeGreaterThan(900);
  expect(grids.every(mark => mark.d.includes(' A ') && mark.d.length < 256)).toBe(true);
  const start = grids[0]!.d.match(/^M ([\d.e+-]+) ([\d.e+-]+) A ([\d.e+-]+)/)!;
  const plot = layoutCartesianChart(changed, 600, 400).plot;
  expect(Number(start[1])).toBeCloseTo(plot.x + plot.width / 2);
  expect(Number(start[2])).toBeCloseTo(plot.y + plot.height / 2 - Number(start[3]));
  expect(layoutChartScene(changed, 1e6, 1e6).label).toBe('Chart preview unavailable');
  expect(changed.axes.find(axis => axis.kind === 'value')?.minorUnit).toBe(.001);
});
