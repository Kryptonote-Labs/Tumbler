import { expect, test } from 'bun:test';
import { createOoxmlChart, parseOoxmlChart, layoutChartScene, type ChartMark } from '../src/index.ts';

const flatten = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flatten(mark.marks) : [mark]);
function surface() {
  const bytes = createOoxmlChart({ type: 'surfaceChart', categories: ['A', 'B'], series: [{ name: 'Front', values: [1, 4] }, { name: 'Back', values: [4, 1] }] });
  const model = parseOoxmlChart(bytes, 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  return { bytes, model };
}

test('surface bands use independent theme colours instead of the first row fill', () => {
  const { model } = surface();
  const colors = new Set(flatten(layoutChartScene(model, 500, 350).marks).filter(mark => mark.kind === 'path').map(mark => mark.fill));
  expect(colors.size).toBeGreaterThan(1);
  const custom = { ...model, themeColors: { accent1: '#112233', accent2: '#223344', accent3: '#334455', accent4: '#445566', accent5: '#556677', accent6: '#667788' } };
  const marks = flatten(layoutChartScene(custom, 500, 350).marks);
  expect(marks.filter(mark => mark.kind === 'path').some(mark => mark.fill === '#334455')).toBe(true);
  expect(marks.filter(mark => mark.kind === 'text').some(mark => mark.text.includes('–'))).toBe(true);
});

test('surface band formats retain authored fill, outline, no-fill and sparse band indices', () => {
  const source = new TextDecoder().decode(surface().bytes).replace('<c:axId val="1"/>', '<c:bandFmts><c:bandFmt><c:idx val="2"/><c:spPr><a:solidFill><a:srgbClr val="FF00FF"/></a:solidFill><a:ln w="25400"><a:solidFill><a:srgbClr val="00FFFF"/></a:solidFill><a:prstDash val="dash"/></a:ln></c:spPr></c:bandFmt><c:bandFmt><c:idx val="3"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:bandFmt></c:bandFmts><c:axId val="1"/>');
  const model = parseOoxmlChart(new TextEncoder().encode(source), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  expect(model.bandFormats).toMatchObject([{ index: 2, style: { fill: { value: '#FF00FF' }, lineStyle: { color: { value: '#00FFFF' } } } }, { index: 3, style: { noFill: true, lineStyle: { noFill: true } } }]);
  const paths = flatten(layoutChartScene(model, 500, 350).marks).filter(mark => mark.kind === 'path');
  expect(paths.some(mark => mark.fill === '#FF00FF' && mark.stroke === '#00FFFF' && mark.strokeDash?.length === 2)).toBe(true);
  expect(paths.some(mark => mark.fill === '#FFC000')).toBe(false);
});

test('surface contour category and row labels follow their own reversed axes', () => {
  const { model } = surface();
  const reversed = { ...model, axes: model.axes.map(axis => ({ ...axis, reversed: true })) };
  const before = flatten(layoutChartScene(model, 500, 350).marks).filter(mark => mark.kind === 'text');
  const after = flatten(layoutChartScene(reversed, 500, 350).marks).filter(mark => mark.kind === 'text');
  const label = (marks: typeof before, text: string) => marks.find(mark => mark.text === text)!;
  expect(label(before, 'A').x).toBeLessThan(label(before, 'B').x);
  expect(label(after, 'A').x).toBeGreaterThan(label(after, 'B').x);
  expect(label(before, 'Front').y).toBeGreaterThan(label(before, 'Back').y);
  expect(label(after, 'Front').y).toBeLessThan(label(after, 'Back').y);
});


test('wireframes discard authored fill gradients while retaining their outlines', () => {
  const { model } = surface();
  const gradient = { kind: 'linear' as const, angle: 0, scaled: true, center: [.5, .5] as const, stops: [{ offset: 0, color: { kind: 'rgb' as const, value: '#FF0000' } }, { offset: 1, color: { kind: 'rgb' as const, value: '#0000FF' } }] };
  const scene = layoutChartScene({ ...model, wireframe: true, bandFormats: Array.from({ length: 12 }, (_, index) => ({ index, style: { gradient } })) }, 500, 350);
  expect(flatten(scene.marks).some(mark => mark.fillGradient)).toBe(false);
});

test('a 3D wireframe follows four source cell edges without an internal triangle diagonal', () => {
  const source = createOoxmlChart({ type: 'surface3DChart', wireframe: true, categories: ['A', 'B'], series: [{ name: 'Front', values: [2, 2] }, { name: 'Back', values: [2, 2] }] });
  const model = parseOoxmlChart(source, 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  const paths = flatten(layoutChartScene(model, 500, 350).marks).filter(mark => mark.kind === 'path');
  expect(paths).toHaveLength(4);
  expect(paths.every(mark => mark.fill === 'none' && !mark.d.endsWith('Z'))).toBe(true);
});

test('a wireframe contour follows interpolated levels rather than source triangle outlines', () => {
  const source = createOoxmlChart({ type: 'surfaceChart', wireframe: true, categories: ['A', 'B'], series: [{ name: 'Front', values: [1, 3] }, { name: 'Back', values: [1, 3] }] });
  const model = parseOoxmlChart(source, 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  const paths = flatten(layoutChartScene(model, 500, 350).marks).filter(mark => mark.kind === 'path');
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) {
    const coordinates = path.d.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)!.map(Number);
    expect(coordinates[0]).toBeCloseTo(coordinates[2]!);
  }
});


test('a wireframe exactly at the authored maximum uses the last height band', () => {
  const bytes = createOoxmlChart({ type: 'surface3DChart', wireframe: true, categories: ['A', 'B'], series: [{ name: 'Front', values: [2, 2] }, { name: 'Back', values: [2, 2] }] });
  const model = parseOoxmlChart(bytes, 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  const scene = layoutChartScene({ ...model, axes: model.axes.map(axis => axis.kind === 'value' ? { ...axis, minimum: 0, maximum: 2, majorUnit: 1 } : axis), bandFormats: [{ index: 0, style: { lineStyle: { color: { kind: 'rgb', value: '#0000FF' } } } }, { index: 1, style: { lineStyle: { color: { kind: 'rgb', value: '#FF0000' } } } }] }, 500, 350);
  const paths = flatten(scene.marks).filter(mark => mark.kind === 'path');
  expect(paths).toHaveLength(4);
  expect(paths.every(mark => mark.stroke === '#FF0000')).toBe(true);
});


test('wireframe edges stop at explicit height bounds before projection', async () => {
  const { surfaceWireframe } = await import('../src/surface-wireframe.ts');
  const segments: number[][] = [];
  surfaceWireframe([{ x: 0, z: 0, value: -1 }, { x: 1, z: 0, value: 3 }, { x: 1, z: 1, value: 3 }, { x: 0, z: 1, value: -1 }], [0, 1, 2], true, new Set(), (a, b) => segments.push([a.value, b.value]), () => {});
  expect(segments).toHaveLength(4);
  expect(segments.flat().every(value => value >= 0 && value <= 2)).toBe(true);
});


test('a contour on a shared cell edge is painted once, preserving authored opacity', async () => {
  const { surfaceWireframe } = await import('../src/surface-wireframe.ts');
  const segments: string[] = [], seen = new Set<string>();
  for (const [left, right] of [[0, .5], [.5, 1]]) surfaceWireframe([{ x: left!, z: 0, value: left! * 2 }, { x: right!, z: 0, value: right! * 2 }, { x: right!, z: 1, value: right! * 2 }, { x: left!, z: 1, value: left! * 2 }], [0, 1, 2], false, seen, (a, b) => segments.push([`${a.x},${a.z}`, `${b.x},${b.z}`].sort().join('/')), () => {});
  expect(segments.filter(segment => segment === '0.5,0/0.5,1')).toHaveLength(1);
});
