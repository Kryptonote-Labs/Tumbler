import { expect, test } from 'bun:test';
import { createOoxmlChart, layoutChartScene, parseOoxmlChart, type ChartMark, type CreateChartOptions } from '../src/index.ts';
import { chartMarksBounds } from '../src/shape-scene.ts';

const flat = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flat(mark.marks) : [mark]);
const layout = (extra = '', mode = 'edge', x = .2, y = .25) => `<c:layout><c:manualLayout><c:xMode val="${mode}"/><c:yMode val="${mode}"/><c:x val="${x}"/><c:y val="${y}"/>${extra}</c:manualLayout></c:layout>`;
function source(type: CreateChartOptions['type'] = 'barChart') {
  return new TextDecoder().decode(createOoxmlChart({ type, title: 'Placed title', categories: ['A', 'B', 'C'], series: [{ name: 'One', values: [2, 4, 3], xValues: [1, 2, 3], bubbleSizes: [1, 2, 3] }, { name: 'Two', values: [1, 3, 2], xValues: [1, 2, 3], bubbleSizes: [1, 2, 3] }, { name: 'Three', values: [3, 2, 4], xValues: [1, 2, 3], bubbleSizes: [1, 2, 3] }] }));
}
function parse(xml: string) {
  const model = parseOoxmlChart(new TextEncoder().encode(xml), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  return model;
}
const text = (marks: readonly ChartMark[], value: string) => flat(marks).find((mark): mark is Extract<ChartMark, { kind: 'text' }> => mark.kind === 'text' && mark.text === value)!;

test('all classic families use the same fitted manual title position', () => {
  for (const type of ['barChart', 'bar3DChart', 'lineChart', 'line3DChart', 'areaChart', 'area3DChart', 'pieChart', 'pie3DChart', 'doughnutChart', 'ofPieChart', 'radarChart', 'scatterChart', 'bubbleChart', 'stockChart', 'surfaceChart', 'surface3DChart'] as const) {
    const model = parse(source(type).replace('<c:overlay val="0"/>', `${layout()}<c:overlay val="0"/>`));
    const mark = text(layoutChartScene(model, 600, 400).marks, 'Placed title');
    const width = mark.text.length * mark.font.size * .55;
    expect(mark.x - (mark.anchor === 'middle' ? width / 2 : mark.anchor === 'end' ? width : 0)).toBeCloseTo(120);
    expect(mark.y - mark.font.size).toBeCloseTo(100);
    expect(layoutChartScene(model, 600, 400).marks.at(-1)).toMatchObject({ kind: 'text', text: 'Placed title' });
  }
});

test('valid title sizes fit the text while invalid or incomplete native frames retain automatic placement', () => {
  const base = source(), automatic = text(layoutChartScene(parse(base), 600, 400).marks, 'Placed title');
  const placed = (manual: string) => text(layoutChartScene(parse(base.replace('<c:overlay val="0"/>', `${manual}<c:overlay val="0"/>`)), 600, 400).marks, 'Placed title');
  expect(placed(layout('<c:w val="0.01"/><c:h val="0.01"/>'))).toEqual(placed(layout()));
  expect(placed(layout('<c:w val="1.1"/>'))).toEqual(automatic);
  expect(placed(layout().replace('<c:y val="0.25"/>', ''))).toEqual(automatic);
  expect(placed(layout('', 'edge', -.1))).toEqual(automatic);
  const shifted = placed(layout('', 'factor', -.05, .1));
  expect(shifted.x).toBeCloseTo(automatic.x - 30);
  expect(shifted.y).toBeCloseTo(automatic.y + 40);
});

test('incomplete native plot frames do not replace automatic layout', () => {
  const model = parse(source().replace('<c:plotArea><c:layout/>', `<c:plotArea>${layout()}`));
  expect(model.plotLayout).toBeUndefined();
});

test('rich point labels retain individual fonts, script baselines, glyph spacing and moved pattern backgrounds', () => {
  const label = `<c:dLbls><c:dLbl><c:idx val="0"/>${layout()}<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1800" b="1"/><a:t>Wide</a:t></a:r><a:r><a:rPr sz="1200" i="1" baseline="30000" spc="150"/><a:t>Wi</a:t></a:r></a:p></c:rich></c:tx><c:spPr><a:pattFill prst="diagCross"><a:fgClr><a:schemeClr val="accent1"/></a:fgClr><a:bgClr><a:schemeClr val="bg1"/></a:bgClr></a:pattFill></c:spPr></c:dLbl></c:dLbls>`;
  const model = parse(source().replace('<c:cat>', `${label}<c:cat>`));
  const scene = flat(layoutChartScene(model, 600, 400, { measureText: value => [...value].reduce((sum, char) => sum + (char === 'W' ? 20 : 5), 0) }).marks);
  const wide = text(scene, 'Wide'), w = text(scene, 'W'), i = text(scene, 'i');
  expect(wide.font).toMatchObject({ size: 24, weight: 700 });
  expect(w.font).toMatchObject({ size: 10.4, italic: true });
  expect(w.y).toBeLessThan(wide.y);
  expect(i.x - w.x).toBeCloseTo(22);
  const background = scene.find(mark => mark.kind === 'rect' && mark.fillPattern)!;
  expect(background).toMatchObject({ x: 120, y: 100 });
  expect(background.fillPattern!.bounds).toMatchObject({ x: 120, y: 100 });
  expect(wide.x).toBeCloseTo(123);
});

test('manual axis titles position their rotated fitted bounds in Cartesian, XY and 3-D scenes', () => {
  for (const type of ['barChart', 'scatterChart', 'bar3DChart'] as const) {
    const xml = source(type).replace('<c:valAx>', `<c:valAx><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Axis units</a:t></a:r></a:p></c:rich></c:tx>${layout()}</c:title>`);
    const model = parse(xml), mark = text(layoutChartScene(model, 600, 400).marks, 'Axis units');
    const context = { measure: (value: string, font: { size: number }) => value.length * font.size * .55 };
    expect(chartMarksBounds(context, [mark])).toMatchObject({ x: expect.closeTo(120), y: expect.closeTo(100) });
    if (type !== 'scatterChart') expect(mark.rotate).toBeDefined();
  }
});

test('trendline equations and custom rich labels move their complete fitted background together', () => {
  for (const custom of [false, true]) {
    const rich = custom ? '<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1800" b="1"/><a:t>Custom fit</a:t></a:r></a:p></c:rich></c:tx>' : '';
    const trend = `<c:trendline><c:trendlineType val="linear"/><c:dispEq val="1"/><c:trendlineLbl>${layout()}${rich}<c:spPr><a:solidFill><a:srgbClr val="FFAA00"/></a:solidFill></c:spPr></c:trendlineLbl></c:trendline>`;
    const model = parse(source('lineChart').replace('<c:cat>', `${trend}<c:cat>`));
    const scene = flat(layoutChartScene(model, 600, 400).marks);
    expect(scene.find(mark => mark.kind === 'rect' && mark.fill === '#FFAA00')).toMatchObject({ x: 120, y: 100 });
    if (custom) expect(text(scene, 'Custom fit').font).toMatchObject({ size: 24, weight: 700 });
    else expect(scene.some(mark => mark.kind === 'text' && mark.text.startsWith('y = '))).toBe(true);
  }
});

test('cached custom trendline and display-unit labels retain their text, style and manual positions', () => {
  const cached = '<c:tx><c:strRef><c:f>Data!A1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Custom units</c:v></c:pt></c:strCache></c:strRef></c:tx>';
  const style = '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1500" b="1"/></a:pPr></a:p></c:txPr>';
  for (const type of ['barChart', 'scatterChart', 'bar3DChart'] as const) {
    const units = `<c:dispUnits><c:builtInUnit val="thousands"/><c:dispUnitsLbl>${layout()}${cached.replace('idx="0"', `idx="${type === 'barChart' ? '00' : type === 'scatterChart' ? '+0' : ' 0 '}"`)}${style}</c:dispUnitsLbl></c:dispUnits>`;
    const xml = source(type).replace('</c:valAx>', `${units}</c:valAx>`);
    const mark = text(layoutChartScene(parse(xml), 600, 400).marks, 'Custom units');
    expect(mark).toMatchObject({ x: 120, y: 120, font: { size: 20, weight: 700 } });
  }
  const trend = `<c:trendline><c:trendlineType val="linear"/><c:dispEq val="1"/><c:trendlineLbl>${layout()}${cached}${style}</c:trendlineLbl></c:trendline>`;
  const scene = flat(layoutChartScene(parse(source('lineChart').replace('<c:cat>', `${trend}<c:cat>`)), 600, 400).marks);
  expect(text(scene, 'Custom units')).toMatchObject({ x: 120, y: 120, font: { size: 20, weight: 700 } });
  expect(scene.some(mark => mark.kind === 'text' && mark.text.startsWith('y = '))).toBe(false);
});

test('manual labels in both split-pie subplots use full-chart coordinates', () => {
  for (const splitType of ['pie', 'bar'] as const) {
    const labels = `<c:dLbls>${[0, 2].map(index => `<c:dLbl><c:idx val="${index}"/>${layout('', 'edge', index ? .6 : .2, index ? .5 : .25)}<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Point ${index}</a:t></a:r></a:p></c:rich></c:tx></c:dLbl>`).join('')}</c:dLbls>`;
    const model = parse(source('ofPieChart').replace('<c:cat>', `${labels}<c:cat>`).replace('<c:ofPieType val="pie"/>', `<c:ofPieType val="${splitType}"/>`));
    const scene = layoutChartScene(model, 600, 400);
    for (const index of [0, 2]) {
      const mark = text(scene.marks, `Point ${index}`);
      expect(mark.x - (mark.anchor === 'middle' ? mark.text.length * mark.font.size * .55 / 2 : mark.anchor === 'end' ? mark.text.length * mark.font.size * .55 : 0)).toBeCloseTo(index ? 360 : 120);
      expect(mark.y - mark.font.size).toBeCloseTo(index ? 200 : 100);
    }
  }
});
