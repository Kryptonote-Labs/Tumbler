import { expect, test } from 'bun:test';
import { createOoxmlChart, layoutChartScene, layoutCartesianChart, layoutScatterChart, OOXML_CHART_TYPES, parseOoxmlChart, type ChartMark, type OoxmlChartType } from '../src/index.ts';

const entries = '<c:legendEntry><c:idx val="1"/><c:delete/></c:legendEntry><c:legendEntry><c:idx val="2"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1800" b="1" i="1"><a:solidFill><a:schemeClr val="accent3"/></a:solidFill><a:latin typeface="Aptos"/></a:defRPr></a:pPr></a:p></c:txPr></c:legendEntry>';
function chart(type: OoxmlChartType, overrides = entries) {
  const xml = new TextDecoder().decode(createOoxmlChart({ type, categories: ['A', 'B', 'C'], series: ['Alpha', 'Beta', 'Gamma'].map((name, index) => ({ name, values: [2 + index, 4 + index, 3 + index], xValues: [1, 2, 3], bubbleSizes: [3, 2, 1] })) }))
    .replace('<c:legendPos val="b"/>', `<c:legendPos val="b"/>${overrides}`);
  const model = parseOoxmlChart(new TextEncoder().encode(xml), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  return { model, xml };
}
const flatten = (marks: readonly ChartMark[]): readonly ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flatten(mark.marks) : [mark]);
function legend(model: ReturnType<typeof chart>['model']) {
  const group = layoutChartScene(model, 600, 400).marks.find(mark => mark.kind === 'group' && mark.role === 'legend');
  return flatten(group?.kind === 'group' ? group.marks : []).filter(mark => mark.kind === 'text');
}

test('every classic chart hides and styles native legend entries without renumbering remaining overrides', () => {
  for (const type of OOXML_CHART_TYPES) {
    const baseline = legend(chart(type, '').model), { model } = chart(type), shown = legend(model);
    expect(model.legend?.entries?.[1]?.deleted).toBe(true);
    expect(shown.map(mark => mark.text)).toEqual(baseline.filter((_, index) => index !== 1).map(mark => mark.text));
    expect(shown.find(mark => mark.text === baseline[2]?.text)?.font).toMatchObject({ size: 24, weight: 700, italic: true, color: '#A5A5A5' });
  }
});

test('legend overrides address list indices rather than sparse native series identities', () => {
  const { xml } = chart('barChart');
  const changed = xml.replace('<c:idx val="0"/>', '<c:idx val="22"/>').replace('<c:idx val="1"/>', '<c:idx val="11"/>').replace('<c:idx val="2"/>', '<c:idx val="56"/>');
  const model = parseOoxmlChart(new TextEncoder().encode(changed), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  expect(legend(model).map(mark => mark.text)).toEqual(['Alpha', 'Gamma']);
  expect(legend(model)[1]?.font.size).toBe(24);
});

test('an explicit false delete keeps an entry, while malformed native indices are rejected', () => {
  const { model, xml } = chart('barChart', '<c:legendEntry><c:idx val="1"/><c:delete val="0"/></c:legendEntry>');
  expect(legend(model).map(mark => mark.text)).toEqual(['Alpha', 'Beta', 'Gamma']);
  expect(() => parseOoxmlChart(new TextEncoder().encode(xml.replace('<c:legendEntry><c:idx val="1"/>', '<c:legendEntry><c:idx val="-1"/>')), 'transitional')).toThrow('Invalid legend entry index');
});

test('individual legend text keeps the host template font and scheme colour binding', () => {
  const { xml } = chart('barChart');
  const model = parseOoxmlChart(new TextEncoder().encode(xml.replace('typeface="Aptos"', 'typeface="+mn-lt"')), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  expect(legend({ ...model, themeColors: { accent3: '#123ABC' }, themeFonts: { '+mn-lt': 'Cambria' } })[1]?.font).toMatchObject({ family: '"Cambria", sans-serif', color: '#123ABC', size: 24 });
});

test('trendlines occupy native legend slots after their ordered series', () => {
  const { xml } = chart('lineChart');
  const named = xml.replace('<c:cat>', '<c:trendline><c:name>FitAlpha</c:name><c:trendlineType val="linear"/></c:trendline><c:cat>');
  let nextOrder = 0;
  const source = named.replace(/<c:order val="\d+"\/>/g, () => `<c:order val="${[2, 0, 1][nextOrder++]}"/>`);
  const model = parseOoxmlChart(new TextEncoder().encode(source), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  // Beta sorts first; idx1 hides Gamma; idx2 formats Alpha, followed by its trendline.
  expect(legend(model).map(mark => mark.text)).toEqual(['Beta', 'Alpha', 'FitAlpha']);
  expect(legend(model)[1]?.font.size).toBe(24);
});

test('XY and surface plots reserve their actual visible legend list and fonts', () => {
  const { model } = chart('scatterChart', '');
  const hidden = { ...model, legend: { ...model.legend!, entries: { 0: { deleted: true }, 1: { deleted: true }, 2: { deleted: true } } } };
  expect(layoutScatterChart(hidden, 600, 400).plot).toEqual(layoutScatterChart({ ...model, legend: undefined }, 600, 400).plot);
  const surface = chart('surfaceChart', '').model;
  const bands = { ...surface, series: surface.series.slice(0, 2), axes: surface.axes.map(axis => axis.kind === 'value' ? { ...axis, minimum: 0, maximum: 9, majorUnit: 1 } : axis),
    legend: { ...surface.legend!, entries: { 0: { deleted: true }, 1: { deleted: true }, 4: { textStyle: { fontSize: 36 } } } } };
  expect(legend(bands).map(mark => mark.text)).toEqual(['2–3', '3–4', '4–5', '5–6', '6–7', '7–8', '8–9']);
  expect(legend(bands).find(mark => mark.text === '4–5')?.font.size).toBe(48);
  expect(layoutCartesianChart(bands, 600, 400).plot.height).toBeLessThan(layoutCartesianChart({ ...bands, legend: undefined }, 600, 400).plot.height);
});

test('resolved entry fonts control spacing when every entry overrides a larger inherited font', () => {
  const { model } = chart('barChart', '');
  const entries = Object.fromEntries([0, 1, 2].map(index => [index, { textStyle: { fontSize: 9 } }]));
  const inherited = { ...model, legend: { ...model.legend!, textStyle: { fontSize: 36 }, entries } };
  const small = { ...inherited, legend: { ...inherited.legend, textStyle: { fontSize: 9 } } };
  expect(layoutCartesianChart(inherited, 600, 400).plot).toEqual(layoutCartesianChart(small, 600, 400).plot);
});

test('long pie labels wrap and occupy separate rows rather than overlapping large entry fonts', () => {
  const { model } = chart('pieChart', '');
  const source = { ...model, plotArea: { fill: { kind: 'rgb' as const, value: '#00FF00' } }, series: model.series.map(series => ({ ...series, categories: { ...series.categories!, points: ['First long category name', 'Second long category name', 'Third long category name'].map((value, index) => ({ index, value })) } })),
    legend: { ...model.legend!, entries: { 2: { textStyle: { fontSize: 36 } } } } };
  const scene = layoutChartScene(source, 360, 400);
  const plot = scene.marks.find(mark => mark.kind === 'rect' && mark.fill === '#00FF00');
  const group = scene.marks.find(mark => mark.kind === 'group' && mark.role === 'legend');
  if (group?.kind !== 'group') throw new Error('Missing legend');
  const boxes = group.marks.map(entry => {
    const text = flatten(entry.kind === 'group' ? entry.marks : []).filter(mark => mark.kind === 'text');
    return { top: Math.min(...text.map(mark => mark.y - mark.font.size)), bottom: Math.max(...text.map(mark => mark.y + mark.font.size * .2)) };
  });
  for (let index = 1; index < boxes.length; index++) expect(boxes[index]!.top).toBeGreaterThanOrEqual(boxes[index - 1]!.bottom);
  if (plot?.kind !== 'rect') throw new Error('Missing plot');
  expect(Math.min(...boxes.map(box => box.top))).toBeGreaterThanOrEqual(plot.y + plot.height);
});


test('automatic split pies reserve their legend frame before placing either subplot', () => {
  const { model } = chart('ofPieChart', '');
  const source = { ...model, plotArea: { fill: { kind: 'rgb' as const, value: '#00FF00' } }, legend: { ...model.legend!, textStyle: { fontSize: 36 } } };
  const scene = layoutChartScene(source, 600, 400);
  const plot = scene.marks.find(mark => mark.kind === 'rect' && mark.fill === '#00FF00');
  const group = scene.marks.find(mark => mark.kind === 'group' && mark.role === 'legend');
  if (plot?.kind !== 'rect' || group?.kind !== 'group') throw new Error('Missing plot or legend');
  const labels = flatten(group.marks).filter(mark => mark.kind === 'text');
  expect(Math.min(...labels.map(mark => mark.y - mark.font.size))).toBeGreaterThanOrEqual(plot.y + plot.height);
});
