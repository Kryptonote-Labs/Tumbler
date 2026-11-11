import { expect, test } from 'bun:test';
import { createOoxmlChart, parseOoxmlChart, layoutChartScene, type ChartMark } from '../src/index.ts';
function chart(type: 'barChart' | 'pieChart' | 'lineChart' | 'scatterChart', markup: string) {
  const source = new TextDecoder().decode(createOoxmlChart({ type, categories: ['A', 'B', 'C'], series: [{ name: 'One', values: [2, 4, 3], xValues: [1, 2, 3] }] }));
  const bytes = new TextEncoder().encode(source.replace(type === 'scatterChart' ? '<c:xVal>' : '<c:cat>', markup + (type === 'scatterChart' ? '<c:xVal>' : '<c:cat>')));
  const model = parseOoxmlChart(bytes, 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  return model;
}
const flat = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flat(mark.marks) : [mark]);

test('individual bars and pie slices retain authored point colours and no-fill', () => {
  const point = '<c:dPt><c:idx val="1"/><c:spPr><a:solidFill><a:srgbClr val="00AA55"/></a:solidFill></c:spPr></c:dPt><c:dPt><c:idx val="2"/><c:spPr><a:noFill/></c:spPr></c:dPt>';
  for (const type of ['barChart', 'pieChart'] as const) {
    const model = chart(type, point);
    const marks = flat(layoutChartScene({ ...model, legend: undefined }, 600, 400).marks);
    expect(marks.some(mark => 'fill' in mark && mark.fill === '#00AA55')).toBe(true);
    expect(marks.some(mark => 'fill' in mark && mark.fill === 'none')).toBe(true);
  }
});

test('line and scatter markers share point shape, size and fill formatting', () => {
  const marker = '<c:dPt><c:idx val="1"/><c:marker><c:symbol val="square"/><c:size val="12"/><c:spPr><a:solidFill><a:srgbClr val="FF3300"/></a:solidFill></c:spPr></c:marker></c:dPt>';
  for (const type of ['lineChart', 'scatterChart'] as const) {
    const model = chart(type, marker);
    const marks = flat(layoutChartScene(model, 600, 400).marks);
    expect(marks.some(mark => mark.kind === 'rect' && mark.fill === '#FF3300' && mark.width === 16)).toBe(true);
  }
});

test('line smoothing creates curves while a missing category keeps a gap', () => {
  const model = chart('lineChart', '');
  const series = model.series[0]!;
  const points = series.values!.points;
  const scene = (values: typeof points) => flat(layoutChartScene({ ...model, series: [{ ...series, smooth: true, values: { ...series.values!, points: values } }] }, 600, 400).marks);
  expect(scene(points).some(mark => mark.kind === 'path' && mark.d.includes(' C '))).toBe(true);
  expect(scene([points[0]!, points[2]!]).some(mark => mark.kind === 'path' && mark.d.includes(' C '))).toBe(false);
});

test('layout uses new point formatting after a host changes the model', () => {
  const model = chart('barChart', '');
  const original = model.series[0]!;
  const first = { ...original, pointFormats: [{ index: 0, fill: { kind: 'rgb' as const, value: '#123456' } }] };
  const next = { ...first, pointFormats: [{ index: 0, fill: { kind: 'rgb' as const, value: '#ABCDEF' } }] };
  expect(flat(layoutChartScene({ ...model, series: [first] }, 600, 400).marks).some(mark => 'fill' in mark && mark.fill === '#123456')).toBe(true);
  expect(flat(layoutChartScene({ ...model, series: [next] }, 600, 400).marks).some(mark => 'fill' in mark && mark.fill === '#ABCDEF')).toBe(true);
});

test('explicit point paint overrides inherited no-fill and hollow markers retain an outline', () => {
  const base = chart('barChart', '');
  const series = { ...base.series[0]!, noFill: true, pointFormats: [{ index: 1, fill: { kind: 'rgb' as const, value: '#FF3300' } }] };
  const marks = flat(layoutChartScene({ ...base, series: [series] }, 600, 400).marks);
  expect(marks.some(mark => mark.kind === 'rect' && mark.fill === '#FF3300')).toBe(true);
  const line = chart('lineChart', '<c:marker><c:symbol val="circle"/><c:spPr><a:noFill/></c:spPr></c:marker>');
  expect(flat(layoutChartScene(line, 600, 400).marks).some(mark => mark.kind === 'circle' && mark.fill === 'none' && mark.stroke && mark.stroke !== 'none')).toBe(true);
});
