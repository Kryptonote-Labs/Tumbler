import { expect, test } from 'bun:test';
import { createOoxmlChart, layoutChartScene, layoutPieSlices, parseOoxmlChart, type ChartMark, type CreateChartOptions } from '../src/index.ts';

const colors = ['FF0000', '00FF00', '0000FF'];
const labels = '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:separator>|</c:separator></c:dLbls>';
const flat = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flat(mark.marks) : [mark]);
function model(type: CreateChartOptions['type'] = 'pieChart', values: readonly number[] = [-4, 3, 2], splitType: 'pie' | 'bar' = 'pie') {
  const source = createOoxmlChart({ type, ...(type === 'ofPieChart' ? { splitType } : {}), categories: ['Negative', 'Positive', 'Smaller'], series: [{ name: 'Data', values }] });
  const points = colors.map((color, index) => `<c:dPt><c:idx val="${index}"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr></c:dPt>`).join('');
  const xml = new TextDecoder().decode(source).replace('<c:cat>', `${points}${labels}<c:cat>`);
  const parsed = parseOoxmlChart(new TextEncoder().encode(xml), 'transitional');
  if (parsed.status !== 'supported') throw new Error(parsed.reason);
  return parsed;
}

test('pie and doughnut slices use magnitudes while retaining signed cache values and point identities', () => {
  for (const type of ['pieChart', 'pie3DChart', 'doughnutChart'] as const) {
    const original = model(type), slices = layoutPieSlices(original);
    expect(slices.map(slice => [slice.index, slice.value])).toEqual([[0, -4], [1, 3], [2, 2]]);
    slices.forEach((slice, index) => expect((slice.endAngle - slice.startAngle) / (Math.PI * 2)).toBeCloseTo([4 / 9, 3 / 9, 2 / 9][index]!));
    const marks = flat(layoutChartScene(original, 600, 400).marks);
    expect(marks.some(mark => mark.kind === 'text' && mark.text === 'Negative|-4|44%')).toBe(true);
    expect(marks.some(mark => mark.kind === 'path' && mark.fill === '#FF0000')).toBe(true);
    expect(original.series[0]!.values!.points.map(point => point.value)).toEqual([-4, 3, 2]);
  }
});

test('all-negative pies and overflowing finite sums still form a finite complete circle', () => {
  for (const values of [[-4, -3, -2], [1e308, -1e308, 1e-308]]) {
    const original = model('pieChart', values), slices = layoutPieSlices(original);
    expect(slices).toHaveLength(3);
    expect(slices.at(-1)!.endAngle - slices[0]!.startAngle).toBeCloseTo(Math.PI * 2);
    expect(slices.every(slice => Number.isFinite(slice.startAngle) && Number.isFinite(slice.endAngle))).toBe(true);
    const marks = flat(layoutChartScene(original, 600, 400).marks);
    expect(marks.filter(mark => mark.kind === 'path').every(mark => !/NaN|Infinity/.test(mark.d))).toBe(true);
  }
});

test('each doughnut ring normalizes its own signed values', () => {
  const original = model('doughnutChart');
  const second = { ...original.series[0]!, index: 1, values: { ...original.series[0]!.values!, points: [{ index: 0, value: -2 }, { index: 1, value: 2 }, { index: 2, value: 0 }] } };
  const marks = flat(layoutChartScene({ ...original, series: [...original.series, second] }, 600, 400).marks);
  const texts = marks.filter(mark => mark.kind === 'text').map(mark => mark.text);
  expect(texts).toContain('Negative|-4|44%');
  expect(texts).toContain('Negative|-2|50%');
  expect(texts).toContain('Positive|2|50%');
});

test('custom split pies retain negative source labels, colours and percentages in either secondary plot', () => {
  for (const splitType of ['pie', 'bar'] as const) {
    const original = { ...model('ofPieChart', [-4, 3, 2], splitType), splitBy: 'cust' as const, customSplit: [0] };
    const scene = layoutChartScene(original, 600, 400), marks = flat(scene.marks);
    expect(marks.some(mark => mark.kind === 'text' && mark.text === 'Negative|-4|44%')).toBe(true);
    expect(marks.some(mark => mark.kind === 'text' && mark.text === 'Positive|3|33%')).toBe(true);
    if (splitType === 'bar') {
      const bar = scene.marks.find(mark => mark.kind === 'rect' && mark.fill === '#FF0000');
      expect(bar?.kind === 'rect' && Number.isFinite(bar.height) && bar.height > 0).toBe(true);
    }
    expect(marks.filter(mark => mark.kind === 'rect').filter(mark => !Number.isFinite(mark.height) || mark.height < 0).map(mark => ({ fill: mark.fill, height: mark.height }))).toEqual([]);
  }
});

test('percentage and value splits use their distinct native criteria with negative values', () => {
  const original = model('ofPieChart', [-4, 3, 2], 'bar');
  const percent = layoutChartScene({ ...original, splitBy: 'percent', splitPosition: 35 }, 600, 400);
  expect(percent.marks.filter(mark => mark.kind === 'rect').filter(mark => colors.some(color => mark.fill === `#${color}`)).map(mark => mark.fill)).toEqual(['#00FF00', '#0000FF']);
  const value = layoutChartScene({ ...original, splitBy: 'val', splitPosition: 0 }, 600, 400);
  expect(value.marks.filter(mark => mark.kind === 'rect').filter(mark => colors.some(color => mark.fill === `#${color}`)).map(mark => mark.fill)).toEqual(['#FF0000']);
});

test('position splitting counts source slots including zero-valued points', () => {
  const original = { ...model('ofPieChart', [4, 2, 0], 'bar'), splitBy: 'pos' as const, splitPosition: 1 };
  const scene = layoutChartScene(original, 600, 400);
  expect(scene.marks.filter(mark => mark.kind === 'rect' && colors.some(color => mark.fill === `#${color}`))).toHaveLength(0);
  expect(flat(scene.marks).some(mark => mark.kind === 'text' && mark.text === 'Negative|4|67%')).toBe(true);
});

test('tiny percentages retain their source fraction when the slice angle rounds to zero', () => {
  const original = model('pieChart', [1, 1e-18, 0]);
  const scene = layoutChartScene(original, 600, 400, { formatNumber: (value, format) => format === '0%' ? value.toExponential() : String(value) });
  expect(flat(scene.marks).some(mark => mark.kind === 'text' && mark.text === 'Positive|1e-18|1e-18')).toBe(true);
});

test('split-pie primary points retain their custom label when their geometry fraction underflows', () => {
  const original = model('ofPieChart', [1e308, 1e-308, 1]);
  const first = original.series[0]!;
  const scene = layoutChartScene({ ...original, splitBy: 'cust', customSplit: [2], series: [{ ...first, dataLabels: { ...first.dataLabels, points: { 1: { text: 'Tiny source' } } } }] }, 600, 400);
  expect(flat(scene.marks).some(mark => mark.kind === 'text' && mark.text === 'Tiny source')).toBe(true);
});
