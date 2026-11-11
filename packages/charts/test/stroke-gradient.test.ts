import { expect, test } from 'bun:test';
import { createCanvas, loadImage, Path2D } from '@napi-rs/canvas';
import { createOoxmlChart, chartScenePictures, layoutChartScene, paintChartScene, parseOoxmlChart, type ChartMark, type ChartScene } from '../src/index.ts';
import { chartPathBounds } from '../src/path-bounds.ts';
import { chartStrokeBounds } from '../src/stroke-bounds.ts';

const flatten = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flatten(mark.marks) : [mark]);
const gradient = { kind: 'linear' as const, angle: 0, scaled: false, center: [.5, .5] as const, stops: [{ offset: 0, color: '#FF0000' }, { offset: 1, color: '#0000FF' }] };

test('gradient outlines bind native stop colours and point solid paint replaces the inherited brush', () => {
  const xml = new TextDecoder().decode(createOoxmlChart({ type: 'barChart', categories: ['A', 'B'], series: [{ name: 'Data', values: [2, 4] }] }))
    .replace(/<a:ln[\s\S]*?<\/a:ln>/, '<a:ln w="38100"><a:gradFill><a:gsLst><a:gs pos="0"><a:schemeClr val="accent2"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:lin/></a:gradFill></a:ln>');
  const model = parseOoxmlChart(new TextEncoder().encode(xml), 'transitional');
  if (model.status !== 'supported') throw Error(model.reason);
  expect(model.series[0]?.lineStyle?.gradient?.stops[0]?.color).toEqual({ kind: 'scheme', value: 'accent2' });
  const painted = { ...model, themeColors: { accent2: '#FF0000' } };
  const brushes = flatten(layoutChartScene(painted, 400, 300).marks).filter(mark => mark.strokeGradient);
  expect(brushes).toHaveLength(2);
  expect(brushes[0]?.strokeGradient?.stops[0]?.color).toBe('#FF0000');
  expect(brushes.every(mark => mark.strokeBounds && mark.strokeBounds.width > 0)).toBe(true);
  const series = model.series.map(series => ({ ...series, pointFormats: [{ index: 0, lineStyle: { color: { kind: 'rgb' as const, value: '#00FF00' } } }] }));
  expect(flatten(layoutChartScene({ ...painted, series }, 400, 300).marks).filter(mark => mark.strokeGradient)).toHaveLength(1);
});

for (const shape of ['rect', 'circle', 'path', 'line'] as const) test(`canvas shades ${shape} outlines without painting their interior`, () => {
  const mark: ChartMark = shape === 'rect' ? { kind: 'rect', x: 10, y: 20, width: 100, height: 80, fill: 'none', stroke: '#000000', strokeWidth: 6 }
    : shape === 'circle' ? { kind: 'circle', cx: 60, cy: 60, r: 40, fill: 'none', stroke: '#000000', strokeWidth: 6 }
    : shape === 'path' ? { kind: 'path', d: 'M 10 100 C 10 0 110 0 110 100', stroke: '#000000', strokeWidth: 6 }
    : { kind: 'line', x1: 10, y1: 60, x2: 110, y2: 60, stroke: '#000000', width: 6 };
  const marks = chartStrokeBounds([{ ...mark, strokeGradient: gradient }], { x: 0, y: 0, width: 120, height: 120 });
  const scene: ChartScene = { width: 120, height: 120, label: shape, marks };
  const canvas = createCanvas(120, 120), ctx = canvas.getContext('2d');
  paintChartScene(ctx, scene, d => new Path2D(d));
  const y = shape === 'rect' ? 20 : shape === 'path' ? 95 : 60;
  const left = shape === 'circle' ? 20 : 11, right = shape === 'circle' ? 100 : 109;
  const red = ctx.getImageData(left, y, 1, 1).data, blue = ctx.getImageData(right, y, 1, 1).data;
  expect(red[0]).toBeGreaterThan(red[2]!);
  expect(blue[2]).toBeGreaterThan(blue[0]!);
  expect(ctx.getImageData(60, shape === 'line' ? 80 : 60, 1, 1).data[3]).toBe(0);
});

test('rectangular outline shading keeps translucent stops off the interior', async () => {
  const scene: ChartScene = { width: 120, height: 120, label: 'Rectangular', marks: chartStrokeBounds([{ kind: 'rect', x: 10, y: 10, width: 100, height: 100, fill: 'none', stroke: '#000000', strokeWidth: 6, strokeGradient: { ...gradient, kind: 'rectangular', stops: [{ offset: 0, color: '#FF0000' }, { offset: 1, color: 'rgba(0,0,255,0.5)' }] } }], { x: 0, y: 0, width: 120, height: 120 }) };
  const canvas = createCanvas(120, 120), ctx = canvas.getContext('2d');
  const images = new Map(await Promise.all(chartScenePictures(scene).map(async picture => { const image = await loadImage(Buffer.from(picture.bytes)); return [picture, { image, width: image.width, height: image.height }] as const; })));
  paintChartScene(ctx, scene, d => new Path2D(d), { image: picture => images.get(picture) });
  expect(ctx.getImageData(60, 60, 1, 1).data[3]).toBe(0);
  const pixel = ctx.getImageData(60, 8, 1, 1).data;
  expect(pixel[2]).toBeGreaterThan(230);
  expect(pixel[3]).toBeGreaterThan(120);
  expect(pixel[3]).toBeLessThan(150);
});

test('outline bounds use cubic extrema and elliptical arc extrema', () => {
  expect(chartPathBounds('M 0 0 C 0 100 100 100 100 0')).toEqual({ x: 0, y: 0, width: 100, height: 75 });
  const ellipse = chartPathBounds('M 100 0 A 100 50 0 1 1 -100 0 A 100 50 0 1 1 100 0 Z');
  expect(ellipse?.x).toBeCloseTo(-100);
  expect(ellipse?.y).toBeCloseTo(-50);
  expect(ellipse?.width).toBeCloseTo(200);
  expect(ellipse?.height).toBeCloseTo(100);
  const narrow = chartPathBounds('M 100 0 A 100 100 0 0 1 0 100 L 0 0 Z');
  expect(narrow).toEqual({ x: 0, y: 0, width: 100, height: 100 });
});

for (const d of ['M 20 100 L 60 30 L 100 100 Z', 'M 20 20 L 100 20 L 100 100 L 20 100 Z']) test('a constant gradient retains the solid outline coverage, including joins', async () => {
  const base = { kind: 'path' as const, d, fill: 'none', stroke: '#FF0000', strokeWidth: 12 };
  const solid = createCanvas(120, 120), shaded = createCanvas(120, 120);
  const scene: ChartScene = { width: 120, height: 120, label: 'Outline', marks: [base] };
  paintChartScene(solid.getContext('2d'), scene, d => new Path2D(d));
  const marks = chartStrokeBounds([{ ...base, strokeGradient: { ...gradient, kind: 'rectangular', stops: [{ offset: 0, color: '#FF0000' }, { offset: 1, color: '#FF0000' }] } }], { x: 0, y: 0, width: 120, height: 120 });
  const painted = { ...scene, marks };
  const images = new Map(await Promise.all(chartScenePictures(painted).map(async picture => { const image = await loadImage(Buffer.from(picture.bytes)); return [picture, { image, width: image.width, height: image.height }] as const; })));
  paintChartScene(shaded.getContext('2d'), painted, d => new Path2D(d), { image: picture => images.get(picture) });
  expect(shaded.getContext('2d').getImageData(0, 0, 120, 120).data).toEqual(solid.getContext('2d').getImageData(0, 0, 120, 120).data);
});

test('width-only point marker overrides retain inherited gradient paint and explicit gradients remain visible', () => {
  const bytes = createOoxmlChart({ type: 'lineChart', categories: ['A', 'B'], series: [{ name: 'Data', values: [2, 4] }] });
  const model = parseOoxmlChart(bytes, 'transitional');
  if (model.status !== 'supported') throw Error(model.reason);
  const authored = { ...gradient, stops: gradient.stops.map(stop => ({ ...stop, color: { kind: 'rgb' as const, value: stop.color } })) };
  const series = model.series.map(series => ({ ...series, noFill: true, lineStyle: { noFill: true }, marker: { symbol: 'circle' as const, noFill: true, lineStyle: { gradient: authored, width: 2 } }, pointFormats: [{ index: 0, marker: { lineStyle: { width: 4 } } }] }));
  const scene = layoutChartScene({ ...model, series }, 400, 300);
  const markers = flatten(scene.marks).filter(mark => mark.kind === 'circle');
  expect(markers).toHaveLength(2);
  expect(markers[0]?.strokeGradient).toBeDefined();
  expect(markers[1]?.strokeGradient).toBeDefined();
  expect(markers[0]).toMatchObject({ strokeWidth: 16 / 3 });
  const canvas = createCanvas(400, 300), ctx = canvas.getContext('2d');
  paintChartScene(ctx, scene, d => new Path2D(d));
  for (const mark of markers) {
    if (mark.kind !== 'circle') continue;
    const pixel = ctx.getImageData(Math.round(mark.cx), Math.round(mark.cy - mark.r), 1, 1).data;
    expect(pixel[0]! + pixel[2]!).toBeGreaterThan(100);
    expect(pixel[1]).toBeLessThan(20);
  }
});

test('large authored miter limits sample only the visible brush region', () => {
  const mark = { kind: 'path' as const, d: 'M 20 100 L 60 30 L 100 100 Z', fill: 'none', stroke: '#FF0000', strokeWidth: 2, miterLimit: 2147483647 / 100000, strokeGradient: { ...gradient, kind: 'rectangular' as const } };
  const scene: ChartScene = { width: 120, height: 120, label: 'Clipped brush', marks: chartStrokeBounds([{ kind: 'group', clip: { x: 30, y: 30, width: 50, height: 50 }, marks: [mark] }], { x: 0, y: 0, width: 120, height: 120 }) };
  const outlined = flatten(scene.marks)[0]!;
  expect(outlined.miterLimit).toBe(mark.miterLimit);
  expect(outlined.strokeBrushBounds).toEqual({ x: 30, y: 30, width: 50, height: 50 });
  const pictures = chartScenePictures(scene);
  expect(pictures).toHaveLength(1);
  expect(pictures[0]!.bytes.length).toBeLessThan(50 * 50 * 5);
});
