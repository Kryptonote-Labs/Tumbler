import { expect, test } from 'bun:test';
import { fitChartTrendline, chartErrorExtents, createOoxmlChart, parseOoxmlChart, layoutChartScene, type ChartTrendline, type ChartErrorBars, type ChartMark } from '../src/index.ts';

function trend(type: ChartTrendline['type'], extra: Partial<ChartTrendline> = {}): ChartTrendline {
  return { type, order: 2, period: 2, forward: 0, backward: 0, displayEquation: false, displayRSquared: false, ...extra };
}
const points = (values: readonly number[], x = (index: number) => index + 1) => values.map((y, index) => ({ index, x: x(index), y }));

test('all regression forms recover known functions and forecasts', () => {
  for (const [type, fn] of [
    ['linear', (x: number) => 3 * x + 7], ['exp', (x: number) => 2 * Math.exp(.3 * x)],
    ['log', (x: number) => 5 * Math.log(x) - 2], ['poly', (x: number) => 2 * x ** 2 - x + 3],
    ['power', (x: number) => 4 * x ** 1.5],
  ] as const) {
    const fit = fitChartTrendline(points([1, 2, 3, 4, 5].map(fn)), trend(type, { forward: 2 }))!;
    expect(fit.evaluate!(6)).toBeCloseTo(fn(6), 8);
    expect(fit.rSquared).toBeCloseTo(1, 10);
    expect(fit.points.at(-1)?.x).toBe(7);
  }
});

test('fixed intercept fits retain the authored constraint and modern Excel zero-intercept R squared', () => {
  const fit = fitChartTrendline(points([2, 5, 7]), trend('linear', { intercept: 0 }))!;
  expect(fit.evaluate!(0)).toBe(0);
  expect(fit.evaluate!(1)).toBeCloseTo(33 / 14, 10);
  expect(fit.rSquared).toBeCloseTo((33 / 14) ** 2 * 14 / 78, 10);
  const exp = fitChartTrendline(points([2 * Math.exp(1), 2 * Math.exp(2), 2 * Math.exp(3)]), trend('exp', { intercept: 2 }))!;
  expect(exp.evaluate!(0)).toBeCloseTo(2, 10);
  expect(exp.evaluate!(4)).toBeCloseTo(2 * Math.exp(4), 8);
});

test('scaled polynomial fitting handles date-sized X coordinates without singular normal equations', () => {
  const fit = fitChartTrendline(points([1, 4, 9, 16, 25], index => 45000 + index), trend('poly'))!;
  expect(fit.evaluate!(45005)).toBeCloseTo(36, 7);
  expect(fitChartTrendline(points([2, 3, 4], () => 1), trend('linear'))).toBeUndefined();
  expect(fitChartTrendline(points([1, 0, 3]), trend('exp'))).toBeUndefined();
});

test('moving averages retain input ordering and start after the requested period', () => {
  const fit = fitChartTrendline(points([4, 8, 3, 7], index => [4, 1, 3, 2][index]!), trend('movingAvg', { period: 3 }))!;
  expect(fit.points).toEqual([{ index: 2, x: 3, y: 5 }, { index: 3, x: 2, y: 6 }]);
});

function errors(valueType: ChartErrorBars['valueType'], extra: Partial<ChartErrorBars> = {}): ChartErrorBars { return { direction: 'y', type: 'both', valueType, value: 2, noEndCap: false, ...extra }; }
test('error amounts handle fixed, percent, sample statistics and sparse custom sides', () => {
  const data = points([-2, 0, 2]);
  expect(chartErrorExtents(data, errors('fixedVal'))[0]).toEqual({ index: 0, minus: 2, plus: 2 });
  expect(chartErrorExtents(data, errors('percentage', { value: 10, type: 'plus' }))[0]).toEqual({ index: 0, minus: 0, plus: .2 });
  expect(chartErrorExtents(data, errors('stdDev'))[0]?.plus).toBe(4);
  expect(chartErrorExtents(data, errors('stdErr'))[0]?.plus).toBeCloseTo(2 / Math.sqrt(3));
  expect(chartErrorExtents(data, errors('cust', { plus: { kind: 'number', formula: undefined, formatCode: undefined, points: [{ index: 2, value: 5 }] } }))).toEqual([{ index: 0, minus: 0, plus: 0 }, { index: 1, minus: 0, plus: 0 }, { index: 2, minus: 0, plus: 5 }]);
});
const flatten = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flatten(mark.marks) : [mark]);
test('authored analytical properties draw coloured error caps and a fitted equation in the shared scene', () => {
  const source = new TextDecoder().decode(createOoxmlChart({ type: 'lineChart', categories: ['A', 'B', 'C'], series: [{ name: 'Series', values: [3, 5, 7] }] }));
  const xml = source.replace('<c:cat>', '<c:trendline><c:spPr><a:ln><a:solidFill><a:srgbClr val="123456"/></a:solidFill></a:ln></c:spPr><c:trendlineType val="linear"/><c:dispRSqr val="1"/><c:dispEq val="1"/></c:trendline><c:errBars><c:errBarType val="both"/><c:errValType val="fixedVal"/><c:val val="1"/><c:spPr><a:ln><a:solidFill><a:srgbClr val="ABCDEF"/></a:solidFill></a:ln></c:spPr></c:errBars><c:cat>');
  const model = parseOoxmlChart(new TextEncoder().encode(xml), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  expect(model.series[0]?.trendlines?.[0]?.type).toBe('linear');
  const marks = flatten(layoutChartScene(model, 600, 400).marks);
  expect(marks.some(mark => mark.kind === 'path' && mark.stroke === '#123456')).toBe(true);
  expect(marks.filter(mark => mark.kind === 'line' && mark.stroke === '#ABCDEF')).toHaveLength(12);
  expect(marks.some(mark => mark.kind === 'text' && mark.text === 'R² = 1')).toBe(true);
});

test('zero lines have a complete equation and nonzero fixed intercepts follow modern Office R squared', () => {
  expect(fitChartTrendline(points([0, 0, 0]), trend('linear'))?.equation).toBe('y = 0');
  expect(fitChartTrendline(points([3, 5, 7]), trend('linear', { intercept: 100 }))?.rSquared).toBeCloseTo(1, 10);
});

test('stacked errors anchor to the visible stack endpoint and normalize percent magnitudes', async () => {
  const { cartesianAnalyticalData } = await import('../src/analytics-bounds.ts');
  const { layoutCartesianChart } = await import('../src/index.ts');
  const source = createOoxmlChart({ type: 'barChart', grouping: 'percentStacked', categories: ['A'], series: [{ name: 'One', values: [2] }, { name: 'Two', values: [3] }] });
  const model = parseOoxmlChart(source, 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  const current = { ...model, series: model.series.map((series, index) => index ? { ...series, errorBars: [errors('fixedVal', { value: 1 })] } : series) };
  const layout = layoutCartesianChart(current, 600, 400);
  const data = cartesianAnalyticalData(current, layout.stacks)[1]!;
  expect(data.points[0]?.y).toBe(1);
  expect(chartErrorExtents(data.points, data.series.errorBars![0]!)[0]?.plus).toBeCloseTo(.2);
  expect(layout.maximum).toBeCloseTo(1.2);
});

test('automatic log bounds include positive analytical extrema beyond a decade', async () => {
  const { layoutScatterChart } = await import('../src/index.ts');
  const model = parseOoxmlChart(createOoxmlChart({ type: 'scatterChart', categories: [], series: [{ name: 'Data', xValues: [1, 2, 3], values: [10, 20, 90] }] }), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  const current = { ...model, axes: model.axes.map(axis => axis.position === 'left' ? { ...axis, logBase: 10 } : axis), series: model.series.map(series => ({ ...series, errorBars: [errors('fixedVal', { value: 20 })] })) };
  expect(layoutScatterChart(current, 600, 400).yMaximum).toBe(1000);
});


test('large finite values retain a finite sample deviation', () => {
  const amount = chartErrorExtents(points([-1e200, 1e200]), errors('stdDev', { value: 1 }))[0]!.plus;
  expect(Number.isFinite(amount)).toBe(true);
  expect(amount / 1e200).toBeCloseTo(Math.sqrt(2), 10);
});


test('logarithmic bounds retain positive error endpoints when another endpoint is negative', async () => {
  const { layoutCartesianChart } = await import('../src/index.ts');
  const model = parseOoxmlChart(createOoxmlChart({ type: 'lineChart', categories: ['A', 'B'], series: [{ name: 'Data', values: [100, 1000] }] }), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  const current = { ...model, axes: model.axes.map(axis => axis.kind === 'value' ? { ...axis, logBase: 10 } : axis), series: model.series.map(series => ({ ...series, errorBars: [errors('fixedVal', { value: 999 })] })) };
  expect(layoutCartesianChart(current, 600, 400).minimum).toBe(1);
});


test('moving-average windows do not overflow when the finite mean is representable', () => {
  const fit = fitChartTrendline(points([9e307, 9e307, 9e307]), trend('movingAvg'))!;
  expect(fit.points.map(point => point.y)).toEqual([9e307, 9e307]);
});
