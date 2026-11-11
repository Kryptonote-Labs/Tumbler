import { expect, test } from 'bun:test';
import { createOoxmlChart, layoutCartesianChart, layoutChartScene, layoutScatterChart, OOXML_CHART_TYPES, parseOoxmlChart, type ChartMark, type OoxmlChartType } from '../src/index.ts';
import { layoutChartLegend } from '../src/legend-layout.ts';

const encoder = new TextEncoder();
const manual = '<c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.2"/><c:y val="0.25"/><c:w val="0.5"/><c:h val="0.5"/></c:manualLayout></c:layout>';
const shape = '<c:spPr><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>';
function chart(type: OoxmlChartType = 'barChart', layout = manual) {
  const source = new TextDecoder().decode(createOoxmlChart({ type, categories: ['A', 'B', 'C'], series: ['Alpha', 'Beta', 'Gamma'].map((name, index) => ({ name, values: [2 + index, 4 + index, 3 + index], xValues: [1, 2, 3], bubbleSizes: [3, 2, 1] })) }))
    .replace('<c:legendPos val="b"/>', `<c:legendPos val="b"/>${layout}`).replace('</c:legend>', `${shape}</c:legend>`);
  const model = parseOoxmlChart(encoder.encode(source), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  return { model, source };
}
const flat = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flat(mark.marks) : [mark]);
const measure = (text: string, font: { size: number }) => text.length * font.size * .55;

test('all classic families paint the native manual legend frame with clipped entry content', () => {
  for (const type of OOXML_CHART_TYPES) {
    const { model } = chart(type), scene = layoutChartScene(model, 600, 400);
    const group = scene.marks.find(mark => mark.kind === 'group' && mark.role === 'legend');
    if (group?.kind !== 'group') throw new Error(`Missing ${type} legend`);
    expect(group.marks[0]).toMatchObject({ kind: 'rect', x: 120, y: 100, width: 300, height: 200, fill: '#00FF00' });
    expect(group.marks[1]).toMatchObject({ kind: 'group', clip: { x: 120, y: 100, width: 300, height: 200 } });
  }
});

test('manual legend placement keeps automatic plot reservation unless overlay changes', () => {
  for (const type of ['barChart', 'scatterChart', 'surface3DChart'] as const) {
    const { model } = chart(type), automatic = chart(type, '').model;
    const layout = type === 'scatterChart' ? layoutScatterChart : layoutCartesianChart;
    expect(layout(model, 600, 400).plot).toEqual(layout(automatic, 600, 400).plot);
    const overlay = { ...model, legend: { ...model.legend!, overlay: true } };
    expect(layout(overlay, 600, 400).plot.height).toBeGreaterThan(layout(model, 600, 400).plot.height);
  }
});

test('a custom frame reflows right and bottom legends identically while preserving native entry order', () => {
  const { model } = chart();
  const series = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'].map((title, index) => ({ ...model.series[index % 3]!, index, order: index, title }));
  const bottom = layoutChartLegend({ ...model, series }, 480, 320, measure);
  const right = layoutChartLegend({ ...model, series, legend: { ...model.legend!, position: 'right' } }, 480, 320, measure);
  expect(right.entries).toEqual(bottom.entries);
  expect(bottom.entries.map(entry => entry.label)).toEqual(series.map(series => series.title));
  expect(bottom.entries[0]!.y).toBe(bottom.entries[3]!.y);
  expect(bottom.entries[4]!.y).toBeGreaterThan(bottom.entries[0]!.y);
  expect(bottom.entries[4]!.x).toBe(bottom.entries[0]!.x);
});

test('hidden entries and individual fonts survive custom legend layout without renumbering', () => {
  const { model } = chart();
  const current = { ...model, legend: { ...model.legend!, entries: { 1: { deleted: true }, 2: { textStyle: { fontSize: 24 } } } } };
  const group = layoutChartScene(current, 600, 400).marks.find(mark => mark.kind === 'group' && mark.role === 'legend');
  if (group?.kind !== 'group') throw new Error('Missing legend');
  const texts = flat(group.marks).filter(mark => mark.kind === 'text');
  expect(texts.map(mark => mark.text)).toEqual(['Alpha', 'Gamma']);
  expect(texts[1]!.font.size).toBe(32);
});

test('invalid and incomplete source frames retain automatic legend geometry', () => {
  const automatic = chart('barChart', '').model;
  for (const layout of [manual.replace('<c:h val="0.5"/>', ''), manual.replace('c:x val="0.2"', 'c:x val="-0.1"')]) {
    const { model } = chart('barChart', layout);
    expect(model.legend?.layout).toBeUndefined();
    expect(layoutChartLegend(model, 600, 400, measure)).toEqual(layoutChartLegend(automatic, 600, 400, measure));
  }
});

test('zero manual extents keep chart source supported and suppress the empty legend frame', () => {
  const { model } = chart('barChart', manual.replace('c:w val="0.5"', 'c:w val="0"'));
  expect(model.legend?.layout?.width).toBe(0);
  expect(layoutChartScene(model, 600, 400).marks.some(mark => mark.kind === 'group' && mark.role === 'legend')).toBe(false);
});

test('a narrow frame lays out a large point legend in one column without losing native indices', () => {
  const { model } = chart('pieChart');
  const points = Array.from({ length: 20_000 }, (_, index) => ({ index, value: index + 1 }));
  const current = { ...model, legend: { ...model.legend!, layout: { ...model.legend!.layout, width: .01 } }, series: [{ ...model.series[0]!, categories: { kind: 'number' as const, formula: undefined, formatCode: undefined, points }, values: { kind: 'number' as const, formula: undefined, formatCode: undefined, points } }] };
  const layout = layoutChartLegend(current, 600, 400, measure);
  expect(layout.entries).toHaveLength(20_000);
  expect(layout.entries[0]!.x).toBe(layout.entries.at(-1)!.x);
  expect(layout.entries.at(-1)!.legendIndex).toBe(19_999);
});
