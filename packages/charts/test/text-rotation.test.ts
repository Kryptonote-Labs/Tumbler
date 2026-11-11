import { expect, test } from 'bun:test';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { createOoxmlChart, layoutCartesianChart, layoutCombinationChart, layoutScatterChart, layoutChartScene, paintChartScene, parseOoxmlChart, updateChartTitle, type ChartMark } from '../src/index.ts';
import { chartMarksBounds } from '../src/shape-scene.ts';

const flat = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flat(mark.marks) : [mark]);
const manual = '<c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.2"/><c:y val="0.25"/></c:manualLayout></c:layout>';
const base = (type: 'barChart' | 'bar3DChart' | 'scatterChart' | 'lineChart' = 'barChart') => new TextDecoder().decode(createOoxmlChart({ type, title: 'Rotated title', categories: ['A', 'B', 'C'], series: [{ name: 'Data', values: [2, 4, 3], xValues: [1, 2, 3] }] }));
function parse(xml: string) {
  const model = parseOoxmlChart(new TextEncoder().encode(xml), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  return model;
}
const measure = { measure: (value: string, font: { size: number }) => value.length * font.size * .55 };
const text = (marks: readonly ChartMark[], value: string) => flat(marks).find((mark): mark is Extract<ChartMark, { kind: 'text' }> => mark.kind === 'text' && mark.text === value)!;

test('title body rotations use clockwise degrees and explicit text properties override rich-body rotation', () => {
  for (const rotation of [-45, 0, 90]) {
    const model = parse(base().replace('<a:bodyPr/>', '<a:bodyPr rot="1800000"/>').replace('</c:title>', `<c:txPr><a:bodyPr rot="${rotation * 60000}"/><a:lstStyle/><a:p/></c:txPr></c:title>`));
    expect(model.titleStyle?.rotation).toBe(rotation);
    expect(text(layoutChartScene(model, 600, 400).marks, 'Rotated title').rotate ?? 0).toBe(rotation);
  }
  expect(parse(base().replace('<a:bodyPr/>', '<a:bodyPr rot="-2700000"/>')).titleStyle?.rotation).toBe(-45);
  expect(parse(base().replace('<a:bodyPr/>', '<a:bodyPr rot="0" vert="vert270"/>')).titleStyle?.rotation).toBe(-90);
});

test('rotated rich title decorations keep their relative positions under manual layout', () => {
  const source = updateChartTitle(new TextEncoder().encode(base()), [{ runs: [{ text: 'Title', style: { highlight: '#FFFF00', underline: 'double', fontSize: 18 } }, { text: ' two', style: { fontSize: 18 } }] }]);
  const model = parse(new TextDecoder().decode(source).replace('<a:bodyPr/>', '<a:bodyPr rot="5400000"/>').replace('<c:overlay val="0"/>', `${manual}<c:overlay val="0"/>`));
  const scene = layoutChartScene(model, 600, 400), first = text(scene.marks, 'Title'), second = text(scene.marks, ' two');
  expect(first.rotate).toBe(90);
  expect(second.x).toBeCloseTo(first.x);
  expect(second.y).toBeGreaterThan(first.y);
  const decorations = flat(scene.marks).filter(mark => mark.kind === 'text' && ['Title', ' two'].includes(mark.text) || mark.kind === 'path' && mark.fill === '#FFFF00' || mark.kind === 'line' && mark.stroke === first.font.color);
  const bounds = chartMarksBounds(measure, decorations)!;
  expect(bounds.x).toBeCloseTo(120);
  expect(bounds.y).toBeCloseTo(100);
  expect(decorations.some(mark => mark.kind === 'path' && mark.fill === '#FFFF00')).toBe(true);
});

test('point labels rotate their text while fitting unrotated pattern backgrounds around the resulting bounds', () => {
  const label = `<c:dLbls><c:dLbl><c:idx val="0"/>${manual}<c:tx><c:rich><a:bodyPr rot="5400000"/><a:lstStyle/><a:p><a:r><a:t>Point label</a:t></a:r></a:p></c:rich></c:tx><c:spPr><a:pattFill prst="diagCross"/></c:spPr></c:dLbl></c:dLbls>`;
  const scene = flat(layoutChartScene(parse(base().replace('<c:cat>', `${label}<c:cat>`)), 600, 400).marks);
  const mark = text(scene, 'Point label'), background = scene.find(mark => mark.kind === 'rect' && mark.fillPattern);
  expect(mark.rotate).toBe(90);
  expect(background).toMatchObject({ x: 120, y: 100, width: expect.closeTo(mark.font.size * 1.2 + 6), height: expect.closeTo(mark.text.length * mark.font.size * .55 + 4) });
  expect(background?.fillPattern?.bounds).toMatchObject({ x: 120, y: 100 });
});

test('explicit zero axis-title rotation overrides automatic Cartesian, XY and 3-D orientation', () => {
  for (const type of ['barChart', 'scatterChart', 'bar3DChart'] as const) {
    const title = '<c:title><c:tx><c:rich><a:bodyPr rot="0"/><a:lstStyle/><a:p><a:r><a:t>Axis title</a:t></a:r></a:p></c:rich></c:tx></c:title>';
    const model = parse(base(type).replace('<c:valAx>', `<c:valAx>${title}`)), scene = layoutChartScene(model, 600, 400);
    const mark = text(scene.marks, 'Axis title');
    expect(mark.rotate).toBe(0);
    const bounds = chartMarksBounds(measure, [mark])!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    if (type === 'scatterChart') {
      const plot = layoutScatterChart(model, 600, 400).plot;
      expect(bounds.y).toBeGreaterThan(plot.y + plot.height);
    } else expect(bounds.x + bounds.width).toBeLessThan(layoutCartesianChart(model, 600, 400).plot.x);
  }
});

test('automatic rotated titles stay on the chart and reserve their measured height', () => {
  for (const type of ['barChart', 'scatterChart'] as const) {
    const model = parse(base(type).replace('<a:bodyPr/>', '<a:bodyPr rot="5400000"/>').replace('Rotated title', 'A vertical title'));
    const scene = layoutChartScene(model, 600, 400), bounds = chartMarksBounds(measure, [text(scene.marks, 'A vertical title')])!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(400);
    const layout = type === 'barChart' ? layoutCartesianChart : layoutScatterChart;
    expect(layout(model, 600, 400).plot.y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
    const top = { ...model, legend: { ...model.legend!, position: 'top' as const } };
    const legend = layoutChartScene(top, 600, 400).marks.find(mark => mark.kind === 'group' && mark.role === 'legend');
    if (legend?.kind !== 'group') throw new Error('Missing legend');
    expect(chartMarksBounds(measure, legend.marks)!.y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
  }
  const source = base().replace('<a:bodyPr/>', '<a:bodyPr rot="5400000"/>').replace('Rotated title', 'This is a rotated chart title');
  const model = parse(source), bounds = chartMarksBounds(measure, [text(layoutChartScene(model, 600, 400).marks, 'This is a rotated chart title')])!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(400);
  const emptyManual = parse(source.replace('<c:overlay val="0"/>', '<c:layout><c:manualLayout/></c:layout><c:overlay val="0"/>'));
  expect(text(layoutChartScene(emptyManual, 600, 400).marks, 'This is a rotated chart title')).toEqual(text(layoutChartScene(model, 600, 400).marks, 'This is a rotated chart title'));
});

test('oriented axis titles clear the chart title and legends on every physical side', () => {
  const original = parse(base().replace('Rotated title', 'Main title'));
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    const model = { ...original, legend: { ...original.legend!, position: side }, axes: original.axes.map(axis => (side === 'top' || side === 'bottom') === (axis.kind === 'category')
      ? { ...axis, title: 'Axis title', titleStyle: { rotation: 0 }, position: side, tickLabelPosition: side === 'top' || side === 'right' ? 'high' as const : 'low' as const } : axis) };
    const scene = layoutChartScene(model, 600, 400), title = chartMarksBounds(measure, [text(scene.marks, 'Main title')])!, axis = chartMarksBounds(measure, [text(scene.marks, 'Axis title')])!;
    const group = scene.marks.find(mark => mark.kind === 'group' && mark.role === 'legend');
    if (group?.kind !== 'group') throw new Error('Missing legend');
    const legend = chartMarksBounds(measure, group.marks)!;
    for (const box of [title, legend]) expect(axis.x + axis.width <= box.x || box.x + box.width <= axis.x || axis.y + axis.height <= box.y || box.y + box.height <= axis.y).toBe(true);
  }
});

test('surface band legends and combination root decorations retain their axis-title frames', () => {
  const surface = parse(new TextDecoder().decode(createOoxmlChart({ type: 'surface3DChart', title: 'Main title', categories: ['A', 'B', 'C'], series: [{ name: 'One', values: [2, 4, 3] }, { name: 'Two', values: [1, 3, 2] }] })));
  const original = parse(base().replace('Rotated title', 'Main title'));
  for (const template of [original, surface]) for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    const primary = { ...template, legend: { ...template.legend!, position: side }, axes: template.axes.map(axis => (side === 'top' || side === 'bottom') === (axis.kind === 'category') && axis.kind !== 'series'
      ? { ...axis, title: 'Axis title', titleStyle: { rotation: 0 }, position: side, tickLabelPosition: side === 'top' || side === 'right' ? 'high' as const : 'low' as const } : axis) };
    const second = { ...primary, kind: 'line' as const, series: primary.series.map(series => ({ ...series, index: series.index + 10 })) };
    const model = template.kind === 'surface' ? primary : { ...primary, plots: [primary, second], series: [...primary.series, ...second.series] };
    const scene = layoutChartScene(model, 600, 400), title = chartMarksBounds(measure, [text(scene.marks, 'Main title')])!, axis = chartMarksBounds(measure, [text(scene.marks, 'Axis title')])!;
    const group = scene.marks.find(mark => mark.kind === 'group' && mark.role === 'legend');
    if (group?.kind !== 'group') throw new Error('Missing legend');
    const legend = chartMarksBounds(measure, group.marks)!;
    for (const box of [title, legend]) expect(axis.x + axis.width <= box.x || box.x + box.width <= axis.x || axis.y + axis.height <= box.y || box.y + box.height <= axis.y).toBe(true);
  }
});

test('independent secondary axis titles reserve their own measured space in a combination', () => {
  const primary = { ...parse(base()), legend: undefined };
  const secondary = { ...primary, kind: 'line' as const, series: primary.series.map(series => ({ ...series, index: series.index + 10 })),
    axisIds: primary.axisIds!.map(id => id + 10), axes: primary.axes.map(axis => ({ ...axis, id: axis.id + 10, ...(axis.crossAxisId === undefined ? {} : { crossAxisId: axis.crossAxisId + 10 }),
      ...(axis.kind === 'value' ? { position: 'right' as const, title: 'A wide secondary axis title', titleStyle: { rotation: 0 } } : {}) })) };
  const model = { ...primary, plots: [primary, secondary], series: [...primary.series, ...secondary.series] };
  const bounds = chartMarksBounds(measure, [text(layoutChartScene(model, 600, 400).marks, 'A wide secondary axis title')])!;
  const plot = layoutCombinationChart(model, 600, 400)[0]!.plot;
  expect(bounds.x).toBeGreaterThan(plot.x + plot.width);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(600);
});

test('custom analytical and display-unit labels use their own body rotations', () => {
  const rich = '<c:tx><c:rich><a:bodyPr rot="1800000"/><a:lstStyle/><a:p><a:r><a:t>Custom fit</a:t></a:r></a:p></c:rich></c:tx>';
  const trend = `<c:trendline><c:trendlineType val="linear"/><c:dispEq val="1"/><c:trendlineLbl>${manual}${rich}</c:trendlineLbl></c:trendline>`;
  expect(text(layoutChartScene(parse(base('lineChart').replace('<c:cat>', `${trend}<c:cat>`)), 600, 400).marks, 'Custom fit').rotate).toBe(30);
  const units = `<c:dispUnits><c:builtInUnit val="thousands"/><c:dispUnitsLbl>${manual}${rich}</c:dispUnitsLbl></c:dispUnits>`;
  expect(text(layoutChartScene(parse(base().replace('</c:valAx>', `${units}</c:valAx>`)), 600, 400).marks, 'Custom fit').rotate).toBe(30);
});

test('canvas painting shows a rotated title instead of retaining horizontal glyphs', () => {
  const xml = new TextDecoder().decode(updateChartTitle(new TextEncoder().encode(base()), [{ runs: [{ text: 'Vertical', style: { fontFamily: 'DejaVu Sans', fontSize: 18, color: { kind: 'rgb', value: '#FF0000' } } }] }])).replace('<a:bodyPr/>', '<a:bodyPr rot="5400000"/>').replace('<c:overlay val="0"/>', `${manual}<c:overlay val="0"/>`);
  const canvas = createCanvas(600, 400), ctx = canvas.getContext('2d');
  const scene = layoutChartScene(parse(xml), 600, 400);
  paintChartScene(ctx, scene, d => new Path2D(d));
  const data = ctx.getImageData(0, 0, 600, 400).data;
  let left = 600, top = 400, right = -1, bottom = -1;
  for (let y = 0; y < 400; y++) for (let x = 0; x < 600; x++) {
    const i = (y * 600 + x) * 4;
    if (data[i]! > 200 && data[i + 1]! < 60 && data[i + 2]! < 60) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  }
  expect(right).toBeGreaterThan(left);
  expect(bottom - top).toBeGreaterThan((right - left) * 2);
});
