import { expect, test } from 'bun:test';
import { layoutCartesianChart, layoutChartScene, layoutCombinationChart, parseOoxmlChart, type ChartMark } from '../src/index.ts';

// Word's default sample values, with its 11pt axis labels and bottom legend.
function sample(majorUnit?: number) {
  const values = [[4.3, 2.5, 3.5, 4.5], [2.4, 4.4, 1.8, 2.8], [2, 2, 3, 5]];
  const xml = `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Chart Title</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${values.map((values, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:val><c:numLit>${values.map((value, j) => `<c:pt idx="${j}"><c:v>${value}</c:v></c:pt>`).join('')}</c:numLit></c:val></c:ser>`).join('')}<c:axId val="1"/><c:axId val="2"/></c:barChart><c:valAx><c:axId val="2"/><c:axPos val="l"/><c:majorGridlines/>${majorUnit === undefined ? '' : `<c:majorUnit val="${majorUnit}"/>`}<c:txPr><a:p><a:pPr><a:defRPr sz="1100"/></a:pPr></a:p></c:txPr></c:valAx></c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend></c:chart></c:chartSpace>`;
  const model = parseOoxmlChart(new TextEncoder().encode(xml), 'transitional');
  if (model.status !== 'supported') throw new Error('Expected sample chart');
  return model;
}

function numericLabels(marks: readonly ChartMark[]): string[] {
  return marks.flatMap(mark => mark.kind === 'text' && /^\d+$/.test(mark.text) && mark.anchor === 'end' ? [mark.text] : mark.kind === 'group' ? numericLabels(mark.marks) : []);
}

test('Word reference: shrinking the sample chart changes unit gridlines to 0, 2, 4, 6', () => {
  const model = sample();
  expect(layoutCartesianChart(model, 720, 420).ticks).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(layoutCartesianChart(model, 720, 214).ticks).toEqual([0, 2, 4, 6]);
  expect(numericLabels(layoutChartScene(model, 720, 214).marks)).toEqual(['0', '2', '4', '6']);
  // Restoring height restores automatic density without modifying the imported model.
  expect(layoutCartesianChart(model, 720, 420).ticks).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(model.axes.find(axis => axis.kind === 'value')?.majorUnit).toBeUndefined();
});

test('explicit OOXML major units and bounds survive resizing, even when labels are dense', () => {
  const source = sample(1);
  const model = { ...source, axes: source.axes.map(axis => ({ ...axis, minimum: 0, maximum: 6 })) };
  for (const height of [100, 214, 420]) {
    expect(layoutCartesianChart(model, 720, height)).toMatchObject({ minimum: 0, maximum: 6, ticks: [0, 1, 2, 3, 4, 5, 6] });
  }
});

test('automatic density follows axis direction and authored label size', () => {
  const source = sample();
  const largeLabels = { ...source, axes: source.axes.map(axis => ({ ...axis, textStyle: { fontSize: 22 } })) };
  expect(layoutCartesianChart(largeLabels, 720, 280).ticks.length).toBeLessThan(layoutCartesianChart(source, 720, 280).ticks.length);
  const bars = { ...source, kind: 'bar' as const };
  expect(layoutCartesianChart(bars, 720, 214).ticks).toEqual(layoutCartesianChart(bars, 720, 420).ticks);
  expect(layoutCartesianChart(bars, 250, 420).ticks.length).toBeLessThan(layoutCartesianChart(bars, 720, 420).ticks.length);
});

test('combination charts use available space on each value axis', () => {
  const source = sample();
  const model = { ...source, plots: [source] };
  expect(layoutCombinationChart(model, 720, 214)[0]?.ticks).toEqual([0, 2, 4, 6]);
  const explicit = sample(1);
  expect(layoutCombinationChart({ ...explicit, plots: [explicit] }, 720, 214)[0]?.ticks).toEqual([0, 1, 2, 3, 4, 5, 6]);
});
