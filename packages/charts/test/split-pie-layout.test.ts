import { expect, test } from 'bun:test';
import { createOoxmlChart, layoutChartScene, parseOoxmlChart, type ChartMark } from '../src/index.ts';
import { splitPieFrames } from '../src/split-pie-layout.ts';

const colors = ['FF0000', '00FF00', '0000FF', 'FF00FF', 'FF8000', '00FFFF', '808080'];
function model(splitType: 'pie' | 'bar' = 'pie', properties = '', conformance: 'strict' | 'transitional' = 'transitional', lines = '<c:serLines/>') {
  const bytes = createOoxmlChart({ type: 'ofPieChart', splitType, conformance, categories: ['A', 'B', 'C', 'D', 'E', 'F'], series: [{ name: 'Data', values: [6, 5, 4, 3, 2, 1] }] });
  const points = colors.map((color, index) => `<c:dPt><c:idx val="${index}"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr></c:dPt>`).join('');
  const labels = '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:separator>|</c:separator></c:dLbls>';
  const xml = new TextDecoder().decode(bytes).replace('<c:cat>', `${points}${labels}<c:cat>`).replace('<c:serLines/>', `${properties}${lines}`);
  const parsed = parseOoxmlChart(new TextEncoder().encode(xml), conformance);
  if (parsed.status !== 'supported') throw new Error(parsed.reason);
  return { ...parsed, legend: undefined };
}
const flat = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flat(mark.marks) : [mark]);

test('split pies parse Office gap defaults and authored size percentages in either namespace', () => {
  for (const conformance of ['strict', 'transitional'] as const) {
    expect(model('pie', '', conformance)).toMatchObject({ gapWidth: 100, secondPieSize: 75, seriesLines: {} });
    expect(model('bar', '<c:gapWidth val="250%"/><c:secondPieSize val="150%"/>', conformance)).toMatchObject({ gapWidth: 250, secondPieSize: 150 });
  }
});

test('secondary sizes and radius-based gaps fit both plots together at the schema extremes', () => {
  for (const splitType of ['pie', 'bar'] as const) for (const secondPieSize of [5, 50, 75, 150, 200]) for (const gapWidth of [0, 100, 500]) {
    const frame = splitPieFrames({ ...model(splitType), secondPieSize, gapWidth }, 500, 300);
    const radius = frame.primary.width / 2;
    expect(frame.secondary.height / frame.primary.height).toBeCloseTo(secondPieSize / 100);
    expect((frame.secondary.x - frame.primary.x - frame.primary.width) / radius).toBeCloseTo(gapWidth / 100);
    expect(frame.secondary.width / frame.secondary.height).toBeCloseTo(splitType === 'bar' ? .5 : 1);
    expect(frame.primary.x).toBeGreaterThanOrEqual(-1e-10);
    expect(frame.secondary.x + frame.secondary.width).toBeLessThanOrEqual(500 + 1e-10);
    expect(Math.max(frame.primary.height, frame.secondary.height)).toBeLessThanOrEqual(300 + 1e-10);
  }
});

test('the combined slice faces the secondary plot and has a localized category name', () => {
  const original = model();
  const marks = flat(layoutChartScene(original, 600, 400).marks);
  const combined = marks.find(mark => mark.kind === 'text' && mark.text === 'Other|3|14%');
  const ordinary = marks.find(mark => mark.kind === 'text' && mark.text === 'A|6|29%');
  expect(combined?.kind === 'text' && ordinary?.kind === 'text' && combined.x > ordinary.x).toBe(true);
  expect(flat(layoutChartScene(original, 600, 400, { otherLabel: 'Autres' }).marks).some(mark => mark.kind === 'text' && mark.text === 'Autres|3|14%')).toBe(true);
  expect(marks.filter(mark => mark.kind === 'path' && mark.fill === '#808080')).toHaveLength(1);
});

test('secondary bars stack source points from bottom to top and honor their requested size', () => {
  for (const size of [50, 150]) {
    const original = model('bar', `<c:secondPieSize val="${size}"/>`);
    const bars = flat(layoutChartScene(original, 600, 400).marks).filter((mark): mark is Extract<ChartMark, { kind: 'rect' }> => mark.kind === 'rect' && ['#FF8000', '#00FFFF'].includes(mark.fill));
    expect(bars).toHaveLength(2);
    expect(bars[0]!.y).toBeGreaterThan(bars[1]!.y);
    expect(bars[0]!.height / bars[1]!.height).toBeCloseTo(2);
    expect(bars[1]!.y + bars[1]!.height).toBeCloseTo(bars[0]!.y);
    const frame = splitPieFrames(original, 568, 368).secondary;
    expect(bars[0]!.width).toBeCloseTo(frame.width);
    expect(bars[0]!.height + bars[1]!.height).toBeCloseTo(frame.height);
  }
});

test('connector endpoints touch the combined wedge and are tangent to the secondary pie', () => {
  const original = model(), marks = flat(layoutChartScene(original, 600, 400).marks);
  const lines = marks.filter(mark => mark.kind === 'line');
  const frame = splitPieFrames(original, 568, 368);
  const primary = { x: 16 + frame.primary.x + frame.primary.width / 2, y: 16 + frame.primary.y + frame.primary.height / 2 };
  const secondary = { x: 16 + frame.secondary.x + frame.secondary.width / 2, y: 16 + frame.secondary.y + frame.secondary.height / 2 };
  expect(lines).toHaveLength(2);
  for (const line of lines) {
    if (line.kind !== 'line') throw new Error('Expected connector');
    expect(Math.hypot(line.x1 - primary.x, line.y1 - primary.y)).toBeCloseTo(frame.primary.width / 2);
    expect(Math.hypot(line.x2 - secondary.x, line.y2 - secondary.y)).toBeCloseTo(frame.secondary.width / 2);
    expect((line.x2 - line.x1) * (line.x2 - secondary.x) + (line.y2 - line.y1) * (line.y2 - secondary.y)).toBeCloseTo(0, 6);
  }
});

test('connector style honors native paint, width, dash and explicit no fill', () => {
  const original = model('bar');
  const styled = model('bar', '', 'transitional', '<c:serLines><c:spPr><a:ln w="19050"><a:solidFill><a:srgbClr val="123456"/></a:solidFill><a:prstDash val="dash"/></a:ln></c:spPr></c:serLines>');
  expect(styled.seriesLines).toMatchObject({ color: { value: '#123456' }, width: 1.5, dash: [4, 3] });
  const lines = flat(layoutChartScene(styled, 600, 400).marks).filter(mark => mark.kind === 'line');
  expect(lines).toHaveLength(2);
  expect(lines.every(mark => mark.stroke === '#123456' && mark.width === 2 && mark.strokeDash?.join(',') === '8,6')).toBe(true);
  expect(flat(layoutChartScene({ ...original, seriesLines: { noFill: true } }, 600, 400).marks).filter(mark => mark.kind === 'line')).toHaveLength(0);
  const { seriesLines: _lines, ...withoutLines } = original;
  expect(flat(layoutChartScene(withoutLines, 600, 400).marks).filter(mark => mark.kind === 'line')).toHaveLength(0);
});

test('connectors follow an exploded combined slice for series and point overrides', () => {
  const original = model(), frame = splitPieFrames(original, 568, 368);
  for (const point of [false, true]) {
    const first = original.series[0]!;
    const changed = { ...original, series: [{ ...first, ...(point ? { pointFormats: [...first.pointFormats ?? [], { index: 6, explosion: 20 }] } : { explosion: 20 }) }] };
    const lines = flat(layoutChartScene(changed, 600, 400).marks).filter(mark => mark.kind === 'line');
    const cx = 16 + frame.primary.x + frame.primary.width / 2 * 1.2, cy = 200;
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(Math.hypot(line.x1 - cx, line.y1 - cy)).toBeCloseTo(frame.primary.width / 2);
  }
});

test('wide combined slices and zero-gap plots keep finite connector geometry', () => {
  for (const splitType of ['pie', 'bar'] as const) for (const secondPieSize of [5, 200]) {
    const original = { ...model(splitType), secondPieSize, gapWidth: 0, splitBy: 'cust' as const, customSplit: [0, 1, 2, 3, 4, 5] };
    const lines = flat(layoutChartScene(original, 600, 400).marks).filter(mark => mark.kind === 'line');
    expect(lines).toHaveLength(2);
    expect(lines.every(mark => [mark.x1, mark.y1, mark.x2, mark.y2].every(Number.isFinite))).toBe(true);
  }
});
