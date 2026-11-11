import { expect, test } from 'bun:test';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { convertChartType, readChart3DProperties, CHART_BAR_SHAPES, createOoxmlChart, parseOoxmlChart, layoutChartScene, layoutCartesianChart, paintChartScene, layoutPieSlices, type ChartMark, type ChartBarShape } from '../src/index.ts';
import { chartProjection } from '../src/projection.ts';
import { threeDGeometry } from '../src/three-d-geometry.ts';

const flatten = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flatten(mark.marks) : [mark]);
function chart(shape: ChartBarShape = 'box', grouping: 'standard' | 'clustered' | 'stacked' = 'clustered') {
  const source = createOoxmlChart({ type: 'bar3DChart', shape, grouping, categories: ['A', 'B'], series: [{ name: 'One', values: [2, 4] }, { name: 'Two', values: [3, 2] }] });
  const model = parseOoxmlChart(source, 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  return { source, model };
}

for (const shape of CHART_BAR_SHAPES) test(`${shape} produces visible 3D data geometry`, () => {
  const { model } = chart(shape);
  const scene = layoutChartScene(model, 500, 350);
  expect(scene.label).not.toBe('Chart preview unavailable');
  const faces = flatten(scene.marks).filter(mark => mark.kind === 'path');
  expect(faces.filter(mark => mark.fill?.startsWith('#') && (mark.fill.slice(1, 3) !== mark.fill.slice(3, 5) || mark.fill.slice(3, 5) !== mark.fill.slice(5, 7))).length).toBeGreaterThan(2);
});

test('standard groups series on depth while clustered groups series across categories', () => {
  const standard = chart('box', 'standard').model, clustered = chart().model;
  const geometry = (model: typeof standard) => threeDGeometry(model, layoutCartesianChart(model, 500, 350));
  const a = geometry(standard), b = geometry(clustered);
  expect(a.categoryBand(0, 0)).toEqual(a.categoryBand(0, 1));
  expect(a.depthBand(0)).not.toEqual(a.depthBand(1));
  expect(b.categoryBand(0, 0)).not.toEqual(b.categoryBand(0, 1));
  expect(b.depthBand(0)).toEqual(b.depthBand(1));
});

test('authored height preserves physical aspect and omitted height follows plot aspect', () => {
  const model = chart().model, plot = { x: 10, y: 10, width: 300, height: 200 };
  const ratio = (heightPercent?: number) => {
    const project = chartProjection({ ...model, threeD: { ...model.threeD!, rotationX: 0, rotationY: 0, ...(heightPercent === undefined ? {} : { heightPercent }) } }, plot);
    const a = project({ x: 0, y: 0, z: 0 }), b = project({ x: 1, y: 1, z: 0 });
    return Math.abs((b.y - a.y) / (b.x - a.x));
  };
  expect(ratio(50)).toBeCloseTo(.5);
  expect(ratio(100)).toBeCloseTo(1);
  expect(ratio()).toBeCloseTo(2 / 3);
});

test('the full Office perspective range changes projection without moving the camera inside the plot', () => {
  const model = chart().model, plot = { x: 10, y: 10, width: 300, height: 200 };
  const corners = [0, 1].flatMap(x => [0, 1].flatMap(y => [0, 1].map(z => ({ x, y, z }))));
  const project = (perspective: number) => chartProjection({ ...model, threeD: { ...model.threeD!, rightAngleAxes: false, perspective } }, plot);
  const ordinary = corners.map(project(120)), wide = corners.map(project(240));
  expect(ordinary).not.toEqual(wide);
  for (const point of wide) {
    expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    expect(point.x).toBeGreaterThanOrEqual(plot.x - 1e-8);
    expect(point.x).toBeLessThanOrEqual(plot.x + plot.width + 1e-8);
    expect(point.y).toBeGreaterThanOrEqual(plot.y - 1e-8);
    expect(point.y).toBeLessThanOrEqual(plot.y + plot.height + 1e-8);
  }
});

test('3D point no-fill and no-line suppress data paint in the actual canvas', () => {
  const model = { ...chart().model, legend: undefined };
  const count = (hidden: boolean) => {
    const canvas = createCanvas(500, 350), context = canvas.getContext('2d');
    const source = { ...model, series: model.series.map(series => ({ ...series, ...(hidden ? { noFill: true, lineStyle: { noFill: true } } : {}) })) };
    paintChartScene(context, layoutChartScene(source, 500, 350), d => new Path2D(d));
    const data = context.getImageData(0, 0, 500, 350).data;
    let colored = 0;
    for (let index = 0; index < data.length; index += 4) if (Math.max(data[index]!, data[index + 1]!, data[index + 2]!) - Math.min(data[index]!, data[index + 1]!, data[index + 2]!) > 30) colored++;
    return colored;
  };
  expect(count(false)).toBeGreaterThan(500);
  expect(count(true)).toBe(0);
});


test('right-angle axes keep category and value directions perpendicular at rotated camera angles', () => {
  const model = chart().model, project = chartProjection(model, { x: 0, y: 0, width: 400, height: 250 });
  const base = project({ x: 0, y: 0, z: 0 }), right = project({ x: 1, y: 0, z: 0 }), top = project({ x: 0, y: 1, z: 0 });
  expect(right.y).toBeCloseTo(base.y);
  expect(top.x).toBeCloseTo(base.x);
  expect(project({ x: 0, y: 0, z: 1 }).x).not.toBeCloseTo(base.x);
});


test('area volumes keep outward normals when category, value or depth direction reverses', async () => {
  const { chartAreaMesh } = await import('../src/area-mesh.ts'), { chartMeshNormal } = await import('../src/bar-mesh.ts');
  for (const category of [false, true]) for (const value of [false, true]) for (const depth of [false, true]) {
    const points = [0, 1].map(index => ({ category: category ? 1 - index : index, start: value ? 1 : 0, end: value ? 1 - (.2 + index * .2) : .2 + index * .2 }));
    const mesh = chartAreaMesh(points, depth ? .7 : .3, depth ? .3 : .7), center = { x: .5, y: value ? .85 : .15, z: .5 };
    for (const face of mesh) {
      const normal = chartMeshNormal(face.vertices);
      if (!normal) continue;
      const first = face.vertices[0]!;
      expect(normal.x * (first.x - center.x) + normal.y * (first.y - center.y) + normal.z * (first.z - center.z)).toBeGreaterThan(0);
    }
  }
});

test('a 3D area uses one continuous series gradient across category segments', () => {
  const bytes = createOoxmlChart({ type: 'area3DChart', categories: ['A', 'B', 'C'], series: [{ name: 'Data', values: [2, 4, 3] }] });
  const xml = new TextDecoder().decode(bytes).replace(/<c:spPr(?:\s[^>]*)?>[\s\S]*?<\/c:spPr>/, '<c:spPr><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:lin ang="0"/></a:gradFill></c:spPr>');
  const model = parseOoxmlChart(new TextEncoder().encode(xml), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  const marks = flatten(layoutChartScene({ ...model, legend: undefined }, 500, 350).marks).filter(mark => mark.fillGradient);
  expect(marks.length).toBeGreaterThan(1);
  expect(new Set(marks.map(mark => JSON.stringify(mark.fillGradient?.bounds))).size).toBe(1);
});

test('parsed 3D pies use the authored Y rotation as the first-slice angle', () => {
  const source = new TextDecoder().decode(createOoxmlChart({ type: 'pie3DChart', categories: ['A', 'B'], series: [{ name: 'Data', values: [2, 4] }] })).replace('<c:rotY val="20"/>', '<c:rotY val="90"/>');
  const model = parseOoxmlChart(new TextEncoder().encode(source), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  expect(model.firstSliceAngle).toBeUndefined();
  expect(layoutPieSlices(model)[0]?.startAngle).toBeCloseTo(0);
});


test('concave area fronts use the whole polygon winding for their lighting normal', async () => {
  const { chartAreaMesh } = await import('../src/area-mesh.ts'), { chartMeshNormal } = await import('../src/bar-mesh.ts');
  const mesh = chartAreaMesh([.4, .2, .8].map((end, index) => ({ category: index / 2, start: 0, end })), .3, .7);
  const front = mesh.find(face => face.vertices.every(vertex => vertex.z === .3))!;
  const back = mesh.find(face => face.vertices.every(vertex => vertex.z === .7))!;
  expect(chartMeshNormal(front.vertices)?.z).toBeLessThan(0);
  expect(chartMeshNormal(back.vertices)?.z).toBeGreaterThan(0);
});


test('the rear wall cannot hide the first cluster of separately coloured 3D bars', () => {
  const original = chart('cylinder').model, colors = [['#FF0000', '#00FF00'], ['#0000FF', '#FF00FF']];
  const model = { ...original, legend: undefined, series: original.series.map((series, seriesIndex) => ({ ...series, lineStyle: { noFill: true }, pointFormats: colors[seriesIndex]!.map((value, index) => ({ index, fill: { kind: 'rgb' as const, value } })) })) };
  const canvas = createCanvas(500, 350), context = canvas.getContext('2d');
  paintChartScene(context, layoutChartScene(model, 500, 350), d => new Path2D(d));
  const data = context.getImageData(0, 0, 500, 350).data, counts: [number, number, number, number] = [0, 0, 0, 0];
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index]!, g = data[index + 1]!, b = data[index + 2]!;
    if (r > 80 && g < 30 && b < 30) counts[0]++;
    if (g > 80 && r < 30 && b < 30) counts[1]++;
    if (b > 80 && r < 30 && g < 30) counts[2]++;
    if (r > 80 && b > 80 && g < 30) counts[3]++;
  }
  for (const count of counts) expect(count).toBeGreaterThan(100);
});


test('horizontal 3D bars keep the same category ordering as their 2D source axis', () => {
  const source = createOoxmlChart({ type: 'bar3DChart', direction: 'bar', categories: ['A', 'B'], series: [{ name: 'Data', values: [2, 4] }] });
  const model = parseOoxmlChart(source, 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  const geometry = threeDGeometry(model, layoutCartesianChart(model, 500, 350)), project = chartProjection(model, layoutCartesianChart(model, 500, 350).plot);
  expect(project(geometry.point(geometry.category(0), 0, 0)).y).toBeGreaterThan(project(geometry.point(geometry.category(1), 0, 0)).y);
  const reversed = { ...model, axes: model.axes.map(axis => axis.kind === 'category' ? { ...axis, reversed: true } : axis) };
  const changed = threeDGeometry(reversed, layoutCartesianChart(reversed, 500, 350));
  expect(project(changed.point(changed.category(0), 0, 0)).y).toBeLessThan(project(changed.point(changed.category(1), 0, 0)).y);
});

test('3D axis crossings use the same authored category/value ownership as 2D charts', () => {
  const original = chart().model;
  const model = { ...original, axes: original.axes.map(axis => axis.kind === 'value' ? { ...axis, minimum: 0, maximum: 10, crossesAt: 3, lineStyle: { color: { kind: 'rgb' as const, value: '#654321' } } } : axis.kind === 'category' ? { ...axis, crossesAt: 1.5, lineStyle: { color: { kind: 'rgb' as const, value: '#123456' } } } : axis) };
  const layout = layoutCartesianChart(model, 500, 350), geometry = threeDGeometry(model, layout), project = chartProjection(model, layout.plot);
  const marks = flatten(layoutChartScene(model, 500, 350).marks), category = marks.filter(mark => mark.kind === 'line').find(mark => mark.stroke === '#123456')!, value = marks.filter(mark => mark.kind === 'line').find(mark => mark.stroke === '#654321')!;
  const a = project(geometry.point(0, 3, 0)), b = project(geometry.point(1, 3, 0));
  expect(category).toMatchObject({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  expect(value.x1).toBeCloseTo(project(geometry.point(geometry.categoryBoundary(.5), 0, 0)).x);
});

test('3D grids and ticks retain their own paint when an axis spine is hidden', () => {
  const original = chart().model;
  const model = { ...original, axes: original.axes.map(axis => axis.kind === 'value' ? { ...axis, minimum: 0, maximum: 6, majorUnit: 2, minorUnit: 1, majorTickMark: 'out' as const, minorGridlines: true, lineStyle: { noFill: true }, minorGridlineStyle: { color: { kind: 'rgb' as const, value: '#FF0000' }, dash: [3, 1] } } : axis) };
  const lines = flatten(layoutChartScene(model, 500, 350).marks).filter(mark => mark.kind === 'line' && mark.stroke === '#FF0000');
  expect(lines).toHaveLength(6);
  expect(lines.every(mark => mark.strokeDash?.length === 2)).toBe(true);
});

test('moving the value spine inside the 3D plot leaves full-width wall gridlines', () => {
  const original = chart().model;
  const model = { ...original, axes: original.axes.map(axis => axis.kind === 'value' ? { ...axis, minimum: 0, maximum: 6, majorUnit: 2, gridlineStyle: { color: { kind: 'rgb' as const, value: '#123456' } } } : axis.kind === 'category' ? { ...axis, crossesAt: 1.5 } : axis) };
  const layout = layoutCartesianChart(model, 500, 350), geometry = threeDGeometry(model, layout), project = chartProjection(model, layout.plot);
  const grids = flatten(layoutChartScene(model, 500, 350).marks).filter(mark => mark.kind === 'line' && mark.stroke === '#123456');
  const a = project(geometry.point(0, 2, 1)), b = project(geometry.point(1, 2, 1));
  expect(grids.some(mark => mark.kind === 'line' && Math.abs(mark.x1 - a.x) < 1e-8 && Math.abs(mark.y1 - a.y) < 1e-8 && Math.abs(mark.x2 - b.x) < 1e-8 && Math.abs(mark.y2 - b.y) < 1e-8)).toBe(true);
});

test('authored wall thickness adds an outward volume and keeps it inside the projected frame', async () => {
  const original = chart().model;
  const plot = { x: 20, y: 20, width: 400, height: 280 };
  const source = (thickness: number) => ({ ...original, walls: { floor: { fill: { kind: 'rgb' as const, value: '#123456' }, thickness } } });
  const thin = source(0), thick = source(20);
  expect(flatten(layoutChartScene(thin, 500, 350).marks).filter(mark => mark.kind === 'path' && mark.fill === '#123456')).toHaveLength(1);
  expect(flatten(layoutChartScene(thick, 500, 350).marks).filter(mark => mark.kind === 'path' && mark.fill === '#123456').length).toBeGreaterThan(1);
  const project = chartProjection(thick, plot), floor = -.2;
  for (const x of [0, 1]) for (const z of [0, 1]) {
    const point = project({ x, y: floor, z });
    expect(point.x).toBeGreaterThanOrEqual(plot.x - 1e-8);
    expect(point.x).toBeLessThanOrEqual(plot.x + plot.width + 1e-8);
    expect(point.y).toBeGreaterThanOrEqual(plot.y - 1e-8);
    expect(point.y).toBeLessThanOrEqual(plot.y + plot.height + 1e-8);
  }
});

test('contour creation authors a top-down camera while imported surface charts retain their camera', () => {
  const source = createOoxmlChart({ type: 'surfaceChart', categories: ['A', 'B'], series: [{ name: 'One', values: [2, 4] }, { name: 'Two', values: [3, 2] }] });
  const model = parseOoxmlChart(source, 'transitional');
  if (model.status !== 'supported') throw Error(model.reason);
  expect(model.threeD).toMatchObject({ rotationX: 90, rotationY: 0, rightAngleAxes: false, perspective: 0 });
  expect(model.axes.find(axis => axis.kind === 'value')?.deleted).toBe(true);
  const changed = parseOoxmlChart(new TextEncoder().encode(new TextDecoder().decode(source).replace('<c:rotX val="90"/>', '<c:rotX val="30"/>')), 'transitional');
  if (changed.status !== 'supported') throw Error(changed.reason);
  expect(changed.threeD?.rotationX).toBe(30);
  expect(flatten(layoutChartScene(model, 500, 350).marks)).not.toEqual(flatten(layoutChartScene(changed, 500, 350).marks));
});


test('a hidden contour value axis still defines band bounds, units and logarithmic projection', () => {
  const source = createOoxmlChart({ type: 'surfaceChart', categories: ['A', 'B'], series: [{ name: 'One', values: [12, 18] }, { name: 'Two', values: [16, 14] }] });
  const original = parseOoxmlChart(source, 'transitional');
  if (original.status !== 'supported') throw Error(original.reason);
  const model = { ...original, axes: original.axes.map(axis => axis.kind === 'value' ? { ...axis, minimum: 10, maximum: 20, majorUnit: 2 } : axis) };
  expect(layoutCartesianChart(model, 500, 350)).toMatchObject({ minimum: 10, maximum: 20, ticks: [10, 12, 14, 16, 18, 20] });
  const log = { ...model, axes: model.axes.map(axis => axis.kind === 'value' ? { ...axis, minimum: 1, maximum: 100, logBase: 10 } : axis) };
  expect(layoutCartesianChart(log, 500, 350)).toMatchObject({ minimum: 1, maximum: 100, ticks: [1, 10, 100] });
});


test('3D category high and low labels follow the raw value end under axis reversal', () => {
  const original = chart().model;
  for (const reversed of [false, true]) for (const side of ['high', 'low'] as const) {
    const model = { ...original, axes: original.axes.map(axis => axis.kind === 'category' ? { ...axis, tickLabelPosition: side } : axis.kind === 'value' ? { ...axis, reversed } : axis) };
    const layout = layoutCartesianChart(model, 500, 350), geometry = threeDGeometry(model, layout), project = chartProjection(model, layout.plot);
    const label = flatten(layoutChartScene(model, 500, 350).marks).find(mark => mark.kind === 'text' && mark.text === 'A');
    const raw = side === 'high' ? layout.maximum : layout.minimum, point = project(geometry.point(geometry.category(0), raw, 0));
    if (label?.kind !== 'text') throw Error('missing category label');
    expect(geometry.value(raw) > .5 ? label.y < point.y : label.y > point.y).toBe(true);
  }
});


test('an edge-on 3D pie culls rear sides before the zero-tilt projection', () => {
  const source = createOoxmlChart({ type: 'pie3DChart', categories: ['Front', 'Back'], series: [{ name: 'Data', values: [1, 1] }] });
  const original = parseOoxmlChart(source, 'transitional');
  if (original.status !== 'supported') throw Error(original.reason);
  const model = { ...original, legend: undefined, threeD: { ...original.threeD!, rotationX: 0, rotationY: 90 }, series: original.series.map(series => ({ ...series, pointFormats: [{ index: 0, fill: { kind: 'rgb' as const, value: '#FF0000' } }, { index: 1, fill: { kind: 'rgb' as const, value: '#0000FF' } }] })) };
  const marks = flatten(layoutChartScene(model, 500, 350).marks);
  expect(marks.filter(mark => mark.kind === 'path' && mark.fill === '#bf0000').length).toBeGreaterThan(0);
  expect(marks.filter(mark => mark.kind === 'path' && mark.fill === '#0000bf')).toHaveLength(0);
});


test('resolved view inspection remains available when chart caches exceed preview budgets', () => {
  const original = chart().source;
  const xml = new TextDecoder().decode(original).replaceAll('<c:ptCount val="2"/>', '<c:ptCount val="1000001"/>');
  const source = new TextEncoder().encode(xml);
  expect(parseOoxmlChart(source, 'transitional').status).toBe('unsupported');
  expect(readChart3DProperties(source).threeD).toMatchObject({ rotationX: 15, rotationY: 20, rightAngleAxes: true });
});

test('an explicit plot shape change replaces imported per-series shape overrides', () => {
  const source = new TextEncoder().encode(new TextDecoder().decode(chart('box').source).replace('</c:ser>', '<c:shape val="cylinder"/></c:ser>'));
  const changed = convertChartType(source, { type: 'bar3DChart', shape: 'pyramid' });
  const model = parseOoxmlChart(changed, 'transitional');
  if (model.status !== 'supported') throw Error(model.reason);
  expect(model.barShape).toBe('pyramid');
  expect(model.series.every(series => series.barShape === undefined)).toBe(true);
});
