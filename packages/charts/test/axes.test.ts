import { expect, test } from 'bun:test';
import { createOoxmlChart, parseOoxmlChart, layoutChartScene, layoutCartesianChart, layoutScatterChart, type SupportedChartModel, type ChartMark } from '../src/index.ts';
import { cartesianGeometry } from '../src/cartesian-geometry.ts';
import { chartDatePosition } from '../src/date-axis.ts';

function chart(xmlEdit: (xml: string) => string = xml => xml, type: 'lineChart' | 'barChart' | 'scatterChart' = 'lineChart') {
  const source = createOoxmlChart({ type, categories: ['A', 'B', 'C'], series: [{ name: 'Data', values: [1, 10, 100], xValues: [1, 10, 100] }] });
  const model = parseOoxmlChart(new TextEncoder().encode(xmlEdit(new TextDecoder().decode(source))), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  return model;
}
const flatten = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flatten(mark.marks) : [mark]);

test('logarithmic axes place powers at equal distances and reverse values without changing ticks', () => {
  const model = chart(xml => xml.replace('<c:valAx>', '<c:valAx>').replace(/<c:valAx>(.*?)<c:scaling>.*?<\/c:scaling>/s, '<c:valAx>$1<c:scaling><c:logBase val="10"/><c:orientation val="maxMin"/><c:min val="1"/><c:max val="100"/></c:scaling>'));
  const layout = layoutCartesianChart(model, 600, 400);
  const geometry = cartesianGeometry(model, layout);
  expect(layout.ticks).toEqual([1, 10, 100]);
  expect(geometry.value(10)).toBeCloseTo((geometry.value(1) + geometry.value(100)) / 2);
  expect(geometry.value(1)).toBeLessThan(geometry.value(100));
});

test('category reversal moves both data and category text to the opposite end', () => {
  const original = chart();
  const reversed = chart(xml => xml.replace('<c:orientation val="minMax"/>', '<c:orientation val="maxMin"/>'));
  const normal = cartesianGeometry(original, layoutCartesianChart(original, 600, 400));
  const reverse = cartesianGeometry(reversed, layoutCartesianChart(reversed, 600, 400));
  expect(normal.category(0)).toBeLessThan(normal.category(2));
  expect(reverse.category(0)).toBeGreaterThan(reverse.category(2));
  const labels = flatten(layoutChartScene(reversed, 600, 400).marks).filter(mark => mark.kind === 'text' && ['A', 'C'].includes(mark.text));
  expect(labels[0]!.kind === 'text' && labels[1]!.kind === 'text' && labels[0]!.x > labels[1]!.x).toBe(true);
});

test('minor gridlines, authored crossing, skipped labels and display units affect the shared scene', () => {
  const model = chart(xml => xml.replace('<c:valAx>', '<c:valAx><c:minorUnit val="5"/><c:minorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="AA00AA"/></a:solidFill></a:ln></c:spPr></c:minorGridlines><c:dispUnits><c:custUnit val="10"/><c:dispUnitsLbl/></c:dispUnits>').replace('<c:catAx>', '<c:catAx><c:tickLblSkip val="2"/>').replace('<c:crosses val="autoZero"/>', '<c:crossesAt val="10"/>'));
  const marks = flatten(layoutChartScene(model, 600, 400).marks);
  expect(marks.filter(mark => mark.kind === 'line' && mark.stroke === '#AA00AA').length).toBeGreaterThan(5);
  expect(marks.some(mark => mark.kind === 'text' && mark.text === 'B')).toBe(false);
  expect(marks.some(mark => mark.kind === 'text' && mark.text === 'C')).toBe(true);
  expect(model.axes[0]?.crossesAt).toBe(10);
  expect(model.axes[1]?.displayUnit).toBe(10);
});

test('a date axis retains actual gaps and formats calendar labels rather than serial strings', () => {
  const model = chart(xml => xml.replaceAll('c:catAx', 'c:dateAx').replace('<c:dateAx>', '<c:dateAx><c:baseTimeUnit val="days"/><c:majorUnit val="30"/><c:majorTimeUnit val="days"/><c:numFmt formatCode="mmm d" sourceLinked="0"/>').replace('<c:strLit>', '<c:numLit>').replace('</c:strLit>', '</c:numLit>').replace('<c:v>A</c:v>', '<c:v>45000</c:v>').replace('<c:v>B</c:v>', '<c:v>45001</c:v>').replace('<c:v>C</c:v>', '<c:v>45060</c:v>'));
  expect(model.axes[0]?.dateAxis).toBe(true);
  const layout = layoutCartesianChart(model, 600, 400);
  const geometry = cartesianGeometry(model, layout);
  expect(geometry.category(2) - geometry.category(1)).toBeCloseTo(59 * (geometry.category(1) - geometry.category(0)), 5);
  const marks = flatten(layoutChartScene(model, 600, 400).marks);
  expect(marks.some(mark => mark.kind === 'text' && mark.text === 'Mar 15')).toBe(true);
  expect(marks.some(mark => mark.kind === 'text' && mark.text === '45000')).toBe(false);
  // Equal calendar-month spacing survives the different lengths of February and March.
  expect(chartDatePosition(44958, 'months', '1900') - chartDatePosition(44927, 'months', '1900')).toBeCloseTo(1);
  expect(chartDatePosition(44986, 'months', '1900') - chartDatePosition(44958, 'months', '1900')).toBeCloseTo(1);
});

test('XY log axes omit nonpositive data and preserve out-of-range geometry for plot clipping', () => {
  const original = chart(undefined, 'scatterChart');
  const axes = original.axes.map(axis => ({ ...axis, minimum: 1, maximum: 100, logBase: 10 }));
  const model: SupportedChartModel = { ...original, axes, series: original.series.map(series => ({ ...series, xValues: { ...series.xValues!, points: [{ index: 0, value: -1 }, { index: 1, value: 10 }, { index: 2, value: 1000 }] } })) };
  const layout = layoutScatterChart(model, 600, 400);
  expect(layout.series[0]).toHaveLength(2);
  expect(layout.series[0]![1]!.plotX).toBeGreaterThan(layout.plot.x + layout.plot.width);
});

test('percent-stacked domains remain normalized when there are no analytical overlays', () => {
  const model = { ...chart(), grouping: 'percent-stacked' as const };
  const layout = layoutCartesianChart(model, 600, 400);
  expect(layout.maximum).toBe(1);
});

test('categorical forecasts reserve visible domain space instead of being clipped at the last category', () => {
  const model = chart(xml => xml.replace('<c:cat>', '<c:trendline><c:trendlineType val="linear"/><c:forward val="2"/><c:backward val="1"/></c:trendline><c:cat>'));
  const layout = layoutCartesianChart(model, 600, 400);
  const geometry = cartesianGeometry(model, layout);
  expect(geometry.category(4)).toBeLessThan(layout.plot.x + layout.plot.width);
  expect(geometry.category(-1)).toBeGreaterThan(layout.plot.x);
});

test('crossing coordinates belong to their own axis rather than the perpendicular axis', () => {
  const original = chart();
  const model = { ...original, axes: original.axes.map(axis => axis.kind === 'value' ? { ...axis, crossesAt: 10, lineStyle: { color: { kind: 'rgb' as const, value: '#00FF00' } } } : { ...axis, crossesAt: 2, lineStyle: { color: { kind: 'rgb' as const, value: '#FF0000' } } }) };
  const layout = layoutCartesianChart(model, 600, 400), geometry = cartesianGeometry(model, layout);
  const marks = flatten(layoutChartScene(model, 600, 400).marks);
  expect(marks.find(mark => mark.kind === 'line' && mark.stroke === '#FF0000')).toMatchObject({ y1: geometry.value(10), y2: geometry.value(10) });
  expect(marks.find(mark => mark.kind === 'line' && mark.stroke === '#00FF00')).toMatchObject({ x1: geometry.categoryBand(1), x2: geometry.categoryBand(1) });
});
