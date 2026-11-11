import { expect, test } from 'bun:test';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { convertChartType, createOoxmlChart, parseOoxmlChart, layoutBubbleChart, layoutChartScene, paintChartScene, type ChartMark } from '../src/index.ts';
const flatten = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flatten(mark.marks) : [mark]);
const data = { type: 'bubbleChart' as const, categories: [], series: [{ name: 'Data', values: [2, 4, 3], xValues: [1, 2, 3], bubbleSizes: [2, 3, 4] }] };
function chart(bubble3D: boolean) { const model = parseOoxmlChart(createOoxmlChart({ ...data, bubble3D }), 'transitional'); if (model.status !== 'supported') throw Error(model.reason); return model; }

test('3D bubble effects retain the same numeric geometry as ordinary bubbles', () => {
  const flat = chart(false), shaded = chart(true);
  expect(shaded.series[0]?.bubble3D).toBe(true);
  expect(layoutBubbleChart(shaded, 500, 350)).toEqual(layoutBubbleChart(flat, 500, 350));
  expect(flatten(layoutChartScene(shaded, 500, 350).marks).filter(mark => mark.kind === 'circle' && mark.fillGradient)).toHaveLength(3);
  expect(flatten(layoutChartScene(flat, 500, 350).marks).filter(mark => mark.kind === 'circle' && mark.fillGradient)).toHaveLength(0);
});

test('a series can independently enable or disable the chart bubble effect', () => {
  const original = chart(true);
  const disabled = { ...original, series: original.series.map(series => ({ ...series, bubble3D: false })) };
  expect(flatten(layoutChartScene(disabled, 500, 350).marks).filter(mark => mark.kind === 'circle' && mark.fillGradient)).toHaveLength(0);
  const xml = new TextDecoder().decode(createOoxmlChart({ ...data, bubble3D: false })).replace('<c:bubble3D val="0"/>', '<c:bubble3D/>');
  const parsed = parseOoxmlChart(new TextEncoder().encode(xml), 'transitional');
  expect(parsed.status === 'supported' && parsed.series[0]?.bubble3D).toBe(true);
});

test('sphere shading paints a highlight and preserves authored no-fill', () => {
  const original = chart(true), model = { ...original, legend: undefined, series: original.series.map(series => ({ ...series, lineStyle: { noFill: true } })) };
  const canvas = createCanvas(500, 350), context = canvas.getContext('2d');
  paintChartScene(context, layoutChartScene(model, 500, 350), d => new Path2D(d));
  const point = layoutBubbleChart(model, 500, 350).series[0]![1]!;
  const pixel = (dx: number, dy: number) => Array.from(context.getImageData(Math.round(point.plotX + dx * point.radius), Math.round(point.plotY + dy * point.radius), 1, 1).data);
  const bright = pixel(-.35, -.35), dark = pixel(.5, .5);
  expect(bright[0]! + bright[1]! + bright[2]!).toBeGreaterThan(dark[0]! + dark[1]! + dark[2]!);
  const hidden = { ...model, series: model.series.map(series => ({ ...series, noFill: true })) };
  expect(flatten(layoutChartScene(hidden, 500, 350).marks).filter(mark => mark.kind === 'circle').every(mark => mark.fill === 'none' && !mark.fillGradient)).toBe(true);
});

test('bubble gallery conversion updates the effect without changing source values', () => {
  const source = createOoxmlChart({ ...data, bubble3D: false });
  const parsed = parseOoxmlChart(convertChartType(source, { type: 'bubbleChart', bubble3D: true }), 'transitional');
  expect(parsed).toMatchObject({ status: 'supported', series: [expect.objectContaining({ bubble3D: true })] });
  if (parsed.status !== 'supported') throw Error(parsed.reason);
  expect(parsed.series[0]?.values?.points.map(point => point.value)).toEqual([2, 4, 3]);
});


test('point bubble effects override series and plot defaults independently', () => {
  const source = new TextDecoder().decode(createOoxmlChart({ ...data, bubble3D: true })).replace('</c:spPr>', '</c:spPr><c:dPt><c:idx val="1"/><c:bubble3D val="0"/></c:dPt>');
  const parsed = parseOoxmlChart(new TextEncoder().encode(source), 'transitional');
  if (parsed.status !== 'supported') throw Error(parsed.reason);
  expect(parsed.series[0]?.pointFormats?.[0]?.bubble3D).toBe(false);
  expect(flatten(layoutChartScene(parsed, 500, 350).marks).filter(mark => mark.kind === 'circle' && mark.fillGradient)).toHaveLength(2);
});


test('bubble gallery changes update explicit series effects and use Office-compatible source placement', () => {
  const original = createOoxmlChart({ ...data, bubble3D: true });
  const changed = convertChartType(original, { type: 'bubbleChart', bubble3D: false });
  const parsed = parseOoxmlChart(changed, 'transitional');
  expect(parsed).toMatchObject({ status: 'supported', series: [expect.objectContaining({ bubble3D: false })] });
  if (parsed.status !== 'supported') throw Error(parsed.reason);
  expect(flatten(layoutChartScene(parsed, 500, 350).marks).filter(mark => mark.kind === 'circle' && mark.fillGradient)).toHaveLength(0);
  const xml = new TextDecoder().decode(original);
  expect(xml.indexOf('<c:bubble3D')).toBeLessThan(xml.indexOf('</c:ser>'));
});
