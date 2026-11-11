import { expect, test } from 'bun:test';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { createOoxmlChart, layoutChartScene, paintChartScene, parseOoxmlChart, type ChartMark, type ChartScene } from '../src/index.ts';

const flatten = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flatten(mark.marks) : [mark]);
const gradient = (shade: string) => `<a:gradFill><a:gsLst><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs><a:gs pos="0"><a:schemeClr val="accent1"><a:alpha val="50000"/></a:schemeClr></a:gs></a:gsLst>${shade}</a:gradFill>`;
function modelWithGradient(shade: string) {
  const bytes = createOoxmlChart({ type: 'barChart', categories: ['A', 'B'], series: [{ name: 'Data', values: [2, 4] }] });
  const xml = new TextDecoder().decode(bytes).replace(/<c:spPr(?:\s[^>]*)?>[\s\S]*?<\/c:spPr>/, `<c:spPr>${gradient(shade)}</c:spPr>`);
  const model = parseOoxmlChart(new TextEncoder().encode(xml), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  return { ...model, themeColors: { accent1: '#FF0000' } };
}

test('gradient stops keep theme bindings, transforms, order and strict percentage positions', () => {
  const model = modelWithGradient('<a:lin ang="5400000" scaled="0"/>');
  expect(model.series[0]?.gradient).toMatchObject({ kind: 'linear', angle: 90, scaled: false, stops: [{ offset: 0, color: { kind: 'scheme', value: 'accent1' } }, { offset: 1, color: { value: '#0000FF' } }] });
  const marks = flatten(layoutChartScene(model, 400, 300).marks).filter(mark => mark.fillGradient);
  expect(marks).toHaveLength(3);
  expect(marks[0]?.fillGradient?.gradient.stops[0]).toEqual({ offset: 0, color: 'rgba(255,0,0,0.5)' });
  const point = { index: 1, fill: { kind: 'rgb' as const, value: '#00FF00' } };
  const changed = { ...model, series: model.series.map(series => ({ ...series, pointFormats: [point] })) };
  expect(flatten(layoutChartScene(changed, 400, 300).marks).filter(mark => mark.fillGradient)).toHaveLength(2);
});

for (const kind of ['linear', 'radial', 'rectangular'] as const) test(`canvas paints ${kind} shading at the shape's authored bounds and retains its outline`, () => {
  const canvas = createCanvas(120, 120), context = canvas.getContext('2d');
  const scene: ChartScene = { width: 120, height: 120, label: kind, marks: [{ kind: 'rect', x: 10, y: 10, width: 100, height: 100, fill: 'none', stroke: '#00FF00', strokeWidth: 2,
    fillGradient: { bounds: { x: 10, y: 10, width: 100, height: 100 }, gradient: { kind, angle: 0, scaled: true, center: [.5, .5], stops: [{ offset: 0, color: '#FF0000' }, { offset: 1, color: '#0000FF' }] } } }] };
  paintChartScene(context, scene, d => new Path2D(d));
  const center = context.getImageData(60, 60, 1, 1).data;
  if (kind === 'linear') { expect(center[0]).toBeGreaterThan(100); expect(center[2]).toBeGreaterThan(100); }
  else { expect(center[0]).toBeGreaterThan(240); expect(context.getImageData(108, 60, 1, 1).data[2]).toBeGreaterThan(230); }
  expect(context.getImageData(10, 60, 1, 1).data[1]).toBe(255);
  expect(context.getImageData(5, 60, 1, 1).data[3]).toBe(0);
});

test('radial and rectangular path gradients retain their authored focus', () => {
  for (const [path, kind] of [['circle', 'radial'], ['rect', 'rectangular']] as const) {
    const model = modelWithGradient(`<a:path path="${path}"><a:fillToRect l="25%" t="20000" r="75000" b="80%"/></a:path>`);
    expect(model.series[0]?.gradient?.kind).toBe(kind);
    expect(model.series[0]?.gradient?.center[0]).toBeCloseTo(.25);
    expect(model.series[0]?.gradient?.center[1]).toBeCloseTo(.2);
  }
});


test('label fill choices replace inherited gradients and no-fill in either direction', () => {
  const model = modelWithGradient('<a:lin ang="0"/>'), gradient = model.series[0]!.gradient!;
  const series = model.series.map(series => ({ ...series, gradient: undefined, dataLabels: { noFill: true, points: { 0: { fill: { kind: 'rgb' as const, value: '#00FF00' } }, 1: { gradient } } } }));
  const scene = layoutChartScene({ ...model, series: series.map(({ gradient, ...series }) => series), dataLabels: { showValue: true, gradient } }, 400, 300);
  const marks = flatten(scene.marks);
  expect(marks.filter(mark => mark.fillGradient)).toHaveLength(1);
  const solid = marks.filter(mark => mark.kind === 'rect').find(mark => mark.fill === '#00FF00');
  expect(solid).toBeDefined();
  expect(solid?.fillGradient).toBeUndefined();
});


test('a point marker size override retains the series marker gradient', () => {
  const model = modelWithGradient('<a:lin ang="0"/>'), gradient = model.series[0]!.gradient!;
  const series = model.series.map(({ gradient: ignored, ...series }) => ({ ...series, marker: { symbol: 'square' as const, size: 9, gradient }, pointFormats: [{ index: 0, marker: { size: 15 } }] }));
  const scene = layoutChartScene({ ...model, kind: 'line', series }, 400, 300);
  const markers = flatten(scene.marks).filter(mark => mark.kind === 'rect' && mark.fillGradient);
  expect(markers).toHaveLength(2);
  expect(markers[0]).toMatchObject({ width: 20, height: 20 });
  expect(markers[1]).toMatchObject({ width: 12, height: 12 });
});


test('a rectangular gradient preserves the full constant-colour focus rectangle', () => {
  const model = modelWithGradient('<a:path path="rect"><a:fillToRect l="25000" t="25000" r="25000" b="0"/></a:path>');
  expect(model.series[0]?.gradient?.focusRect).toEqual([.25, .25, .75, 1]);
  const canvas = createCanvas(120, 120), context = canvas.getContext('2d');
  const gradient = model.series[0]!.gradient!;
  paintChartScene(context, { width: 120, height: 120, label: 'Focus', marks: [{ kind: 'rect', x: 10, y: 10, width: 100, height: 100, fill: 'none', fillGradient: { bounds: { x: 10, y: 10, width: 100, height: 100 }, gradient: { ...gradient, stops: [{ offset: 0, color: '#FF0000' }, { offset: 1, color: '#0000FF' }] } } }] }, d => new Path2D(d));
  expect([...context.getImageData(60, 90, 1, 1).data]).toEqual([255, 0, 0, 255]);
  expect(context.getImageData(11, 60, 1, 1).data[2]).toBeGreaterThan(230);
});

test('dot marker gradient bounds fit its actual circle instead of the nominal marker size', () => {
  const model = modelWithGradient('<a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>');
  const series = model.series.map(({ gradient: ignored, ...series }) => ({ ...series, marker: { symbol: 'dot' as const, size: 18, gradient: model.series[0]!.gradient! } }));
  const mark = flatten(layoutChartScene({ ...model, kind: 'line', series }, 400, 300).marks).find(mark => mark.kind === 'circle' && mark.fillGradient);
  expect(mark).toMatchObject({ r: 4, fillGradient: { bounds: { width: 8, height: 8 } } });
});
