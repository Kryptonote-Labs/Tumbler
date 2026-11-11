import { expect, test } from 'bun:test';
import { chartMarksBounds } from '../src/shape-scene.ts';
import { pieProjection } from '../src/pie-projection.ts';
import { createOoxmlChart, parseOoxmlChart, layoutChartScene, convertChartType, type ChartMark } from '../src/index.ts';

function model(rotation: number, explosion = 0, manual = false) {
  const source = new TextDecoder().decode(createOoxmlChart({ type: 'pie3DChart', categories: ['North', 'East', 'West'], series: [{ name: 'Data', values: [6, 3, 1] }] }));
  const layout = manual ? '<c:dLbl><c:idx val="1"/><c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.85"/><c:y val="0.05"/></c:manualLayout></c:layout></c:dLbl>' : '';
  const labels = `<c:dLbls>${layout}<c:dLblPos val="ctr"/><c:showCatName val="1"/><c:showLeaderLines val="1"/><c:leaderLines><c:spPr><a:ln><a:solidFill><a:srgbClr val="FF00FF"/></a:solidFill></a:ln></c:spPr></c:leaderLines></c:dLbls>`;
  const xml = source.replace('<c:rotY val="20"/>', `<c:rotY val="${rotation}"/>`).replace('<c:cat>', `<c:explosion val="${explosion}"/>${labels}<c:cat>`).replace(/<c:legend>[\s\S]*?<\/c:legend>/, '');
  const bytes = new TextEncoder().encode(xml), parsed = parseOoxmlChart(bytes, 'transitional');
  if (parsed.status !== 'supported') throw new Error(parsed.reason);
  return { parsed, bytes };
}
const flat = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flat(mark.marks) : [mark]);
const scene = (rotation: number, explosion = 0, manual = false) => layoutChartScene(model(rotation, explosion, manual).parsed, 480, 320);
const label = (marks: readonly ChartMark[], name: string) => flat(marks).find((mark): mark is Extract<ChartMark, { kind: 'text' }> => mark.kind === 'text' && mark.text === name)!;

test('3-D pie rotation moves wedges and labels clockwise around the pie', () => {
  const first = scene(0), quarter = scene(90), half = scene(180);
  expect(label(first.marks, 'North').x).toBeGreaterThan(240);
  expect(label(quarter.marks, 'North').x).toBeLessThan(240);
  expect(label(half.marks, 'North').x).toBeLessThan(240);
  expect(label(quarter.marks, 'East').y).toBeLessThan(label(first.marks, 'East').y);
  expect(first.marks.filter(mark => mark.kind === 'path')).not.toEqual(quarter.marks.filter(mark => mark.kind === 'path'));
  for (const name of ['North', 'East', 'West']) {
    expect(label(scene(360).marks, name).x).toBeCloseTo(label(first.marks, name).x);
    expect(label(scene(360).marks, name).y).toBeCloseTo(label(first.marks, name).y);
  }
});

test('explosion follows the rotated slice rather than its original angle', () => {
  const original = model(90).parsed;
  const chart = { ...original, series: [{ ...original.series[0]!, pointFormats: [{ index: 1, explosion: 25 }] }] };
  const normal = label(scene(90).marks, 'East'), exploded = label(layoutChartScene(chart, 480, 320).marks, 'East');
  expect(exploded.x).toBeCloseTo(normal.x);
  expect(exploded.y).toBeLessThan(normal.y);
});

test('manual labels stay fixed while their leader anchor follows the rotated wedge', () => {
  const first = scene(0, 0, true), quarter = scene(90, 0, true);
  const before = flat(first.marks).find(mark => mark.kind === 'line' && mark.stroke === '#FF00FF');
  const after = flat(quarter.marks).find(mark => mark.kind === 'line' && mark.stroke === '#FF00FF');
  if (before?.kind !== 'line' || after?.kind !== 'line') throw new Error('Expected leader');
  expect(label(first.marks, 'East').x).toBeCloseTo(label(quarter.marks, 'East').x);
  expect(label(first.marks, 'East').y).toBeCloseTo(label(quarter.marks, 'East').y);
  expect(before.x1).toBeLessThan(240);
  expect(after.x1).toBeCloseTo(240);
  expect(after.y1).toBeLessThan(before.y1);
});

test('a 2-D pie ignores retained 3-D camera settings after conversion', () => {
  const first = parseOoxmlChart(convertChartType(model(0).bytes, { type: 'pieChart' }), 'transitional');
  const last = parseOoxmlChart(convertChartType(model(90).bytes, { type: 'pieChart' }), 'transitional');
  if (first.status !== 'supported' || last.status !== 'supported') throw new Error('Expected 2-D pie');
  expect(layoutChartScene(first, 480, 320)).toEqual(layoutChartScene(last, 480, 320));
});

const reference = [
  { rotation: 0, centers: { North: [322.215, 142.576], East: [155.286, 135.736], West: [215.209, 116.084] } },
  { rotation: 90, centers: { North: [212.353, 157.692], East: [240.054, 115.140], West: [319.252, 129.123] } },
  { rotation: 180, centers: { North: [160.879, 129.123], East: [324.822, 135.736], West: [267.778, 157.692] } },
  { rotation: 270, centers: { North: [264.922, 116.084], East: [240.054, 158.902], West: [157.917, 142.576] } },
];

test('projected center labels follow the controlled LibreOffice camera at four rotations', () => {
  const measure = (text: string) => text.length * 7;
  for (const { rotation, centers } of reference) {
    const original = model(rotation).parsed;
    const chart = { ...original, plotLayout: { target: 'inner' as const, xMode: 'edge' as const, yMode: 'edge' as const, wMode: 'factor' as const, hMode: 'factor' as const, x: .1, y: .1, width: .8, height: .8 } };
    const marks = layoutChartScene(chart, 480, 320, { measureText: measure }).marks;
    for (const [name, [x, y]] of Object.entries(centers)) {
      const bounds = chartMarksBounds({ measure }, [label(marks, name)])!;
      expect(Math.abs(bounds.x + bounds.width / 2 - x!)).toBeLessThan(.3);
      // Native text bounds include font ascent/descent; camera coordinates differ by <2 CSS px.
      expect(Math.abs(bounds.y + bounds.height / 2 - y!)).toBeLessThan(2);
    }
  }
});

test('perspective changes pie geometry while Cartesian percentages and right-angle axes do not', () => {
  const original = model(0).parsed;
  const camera = original.threeD!;
  const changed = (settings: Partial<typeof camera>) => layoutChartScene({ ...original, threeD: { ...camera, ...settings } }, 480, 320);
  expect(changed({ perspective: 0 })).not.toEqual(changed({ perspective: 30 }));
  expect(changed({ heightPercent: 100 })).toEqual(changed({ heightPercent: 200 }));
  expect(changed({ depthPercent: 100 })).toEqual(changed({ depthPercent: 200 }));
  expect(changed({ rightAngleAxes: false })).toEqual(changed({ rightAngleAxes: true }));
  for (const rotationX of [0, 45, 90]) for (const perspective of [0, 30, 200]) {
    const marks = flat(changed({ rotationX, perspective }).marks);
    expect(marks.every(mark => mark.kind !== 'path' || !/NaN|Infinity/.test(mark.d))).toBe(true);
    expect(marks.every(mark => mark.kind !== 'text' || Number.isFinite(mark.x + mark.y))).toBe(true);
  }
});

test('projected label hit tests invert the top plane across elevations and perspectives', () => {
  const camera = model(0).parsed.threeD!;
  for (const rotationX of [15, 45, 90]) for (const perspective of [0, 30, 200]) {
    const { project, unproject } = pieProjection({ ...camera, rotationX, perspective }, { x: 48, y: 32, width: 384, height: 256 });
    for (const [x, y] of [[0, 0], [.3, -.2], [-.1, .4]]) {
      const point = project(x!, y!), inverse = unproject(point.x, point.y);
      if (!inverse) throw new Error('Expected an invertible top plane');
      expect(inverse.x).toBeCloseTo(x!, 8);
      expect(inverse.y).toBeCloseTo(y!, 8);
    }
  }
});

test('exploded slices remain fitted and finite at the strongest perspective', () => {
  const original = model(60).parsed;
  const first = original.series[0]!;
  for (const explosion of [100, 400]) for (const rotationX of [0, 45, 90]) {
    const chart = { ...original, threeD: { ...original.threeD!, rotationX, perspective: 200 }, series: [{ ...first, explosion }] };
    for (const mark of flat(layoutChartScene(chart, 480, 320).marks)) {
      if (mark.kind !== 'path') continue;
      const coordinates = mark.d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)!.map(Number);
      expect(coordinates.every(Number.isFinite)).toBe(true);
      expect(coordinates.every((value, index) => value >= 16 - 1e-6 && value <= (index % 2 ? 304 : 464) + 1e-6)).toBe(true);
    }
  }
});

test('a shared series gradient keeps a common pie frame rather than restarting per wedge', () => {
  const original = model(0).parsed;
  const gradient = { kind: 'linear' as const, angle: 90, scaled: false, center: [.5, .5] as const, stops: [{ offset: 0, color: { kind: 'rgb' as const, value: '#FF0000' } }, { offset: 1, color: { kind: 'rgb' as const, value: '#0000FF' } }] };
  const chart = { ...original, series: [{ ...original.series[0]!, gradient }] };
  const paints = flat(layoutChartScene(chart, 480, 320).marks).flatMap(mark => mark.fillGradient ? [mark.fillGradient] : []);
  expect(paints).toHaveLength(3);
  expect(paints[0]!.bounds).toEqual(paints[1]!.bounds);
  expect(paints[1]!.bounds).toEqual(paints[2]!.bounds);
  const first = chart.series[0]!;
  const narrow = { ...chart, threeD: { ...chart.threeD!, rotationX: 0, rotationY: 103, perspective: 200 }, series: [{ ...first,
    values: { ...first.values!, points: [{ index: 0, value: 1 }, { index: 1, value: 99 }] },
    pointFormats: [{ index: 0, explosion: 400 }],
  }] };
  const brushes = flat(layoutChartScene(narrow, 480, 320).marks).flatMap(mark => mark.fillGradient ? [mark.fillGradient.bounds] : []);
  expect(brushes).toHaveLength(2);
  for (const frame of brushes) {
    expect(Object.values(frame).every(Number.isFinite)).toBe(true);
    expect(frame.x).toBeGreaterThanOrEqual(16 - 1e-6);
    expect(frame.y).toBeGreaterThanOrEqual(16 - 1e-6);
    expect(frame.x + frame.width).toBeLessThanOrEqual(464 + 1e-6);
    expect(frame.y + frame.height).toBeLessThanOrEqual(304 + 1e-6);
  }
});
