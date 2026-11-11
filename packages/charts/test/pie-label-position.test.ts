import { expect, test } from 'bun:test';
import { createOoxmlChart, layoutChartScene, parseOoxmlChart, type ChartMark } from '../src/index.ts';
import { chartMarksBounds } from '../src/shape-scene.ts';

const widths: Readonly<Record<string, number>> = { North: 41 / 1.125, East: 32 / 1.125, West: 37 / 1.125 };
const measureText = (text: string) => widths[text] ?? text.length * 7;
const flags = '<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/>';
const font = '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000"><a:latin typeface="DejaVu Sans"/></a:defRPr></a:pPr></a:p></c:txPr>';
function chart(position: string, extra = '', type: 'pieChart' | 'pie3DChart' | 'doughnutChart' | 'ofPieChart' = 'pieChart', conformance: 'strict' | 'transitional' = 'transitional') {
  const source = new TextDecoder().decode(createOoxmlChart({ type, conformance, categories: ['North', 'East', 'West'], series: [{ name: 'Data', values: [6, 3, 1] }] }));
  const frame = '<c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:wMode val="factor"/><c:hMode val="factor"/><c:x val="0.1"/><c:y val="0.1"/><c:w val="0.8"/><c:h val="0.8"/></c:manualLayout></c:layout>';
  const xml = source.replace('<c:cat>', `<c:dLbls>${extra}${font}<c:dLblPos val="${position}"/>${flags}</c:dLbls><c:cat>`).replace('<c:plotArea><c:layout/>', `<c:plotArea>${frame}`).replace(/<c:legend>[\s\S]*?<\/c:legend>/, '');
  const model = parseOoxmlChart(new TextEncoder().encode(xml), conformance);
  if (model.status !== 'supported') throw new Error(model.reason);
  return model;
}
const flat = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flat(mark.marks) : [mark]);
function labels(model: ReturnType<typeof chart>) {
  return flat(layoutChartScene(model, 480, 320, { measureText }).marks).filter((mark): mark is Extract<ChartMark, { kind: 'text' }> => mark.kind === 'text' && mark.text in widths);
}

test('pie center labels match the LibreOffice wedge midpoints', () => {
  const reference = { North: [428.5, 291.5], East: [288, 269.5], West: [337.5, 201.5] };
  for (const conformance of ['strict', 'transitional'] as const) for (const mark of labels(chart('ctr', '', 'pieChart', conformance))) {
    const box = chartMarksBounds({ measure: measureText }, [mark])!;
    const expected = reference[mark.text as keyof typeof reference]!;
    expect(Math.abs(90 + (box.x + box.width / 2) * 1.125 - expected[0]!)).toBeLessThan(1);
    expect(Math.abs(90 + (box.y + box.height / 2) * 1.125 - expected[1]!)).toBeLessThan(1);
  }
});

test('inside and outside ends match the LibreOffice label edges in each quadrant', () => {
  const reference = {
    inEnd: { North: [450, 295], East: [222, 261], West: [317, 139] },
    outEnd: { North: [503, 316], East: [178, 261], West: [277, 110] },
  };
  for (const position of ['inEnd', 'outEnd'] as const) for (const mark of labels(chart(position))) {
    const box = chartMarksBounds({ measure: measureText }, [mark])!;
    const expected = reference[position][mark.text as keyof typeof reference.inEnd]!;
    expect(Math.abs(90 + box.x * 1.125 - expected[0]!)).toBeLessThan(1);
    expect(Math.abs(90 + box.y * 1.125 - expected[1]!)).toBeLessThan(1);
  }
});

test('best fit keeps wide slices centered and moves a label that cannot fit outside', () => {
  const centered = labels(chart('ctr')), fitted = labels(chart('bestFit'));
  expect(fitted.find(mark => mark.text === 'North')).toEqual(centered.find(mark => mark.text === 'North'));
  const original = chart('bestFit');
  const first = original.series[0]!;
  const wide = { ...original, series: [{ ...first, dataLabels: { ...first.dataLabels, points: { 2: { text: 'A label wider than the entire wedge' } } } }] };
  const mark = flat(layoutChartScene(wide, 480, 320, { measureText }).marks).find(mark => mark.kind === 'text' && mark.text === 'A label wider than the entire wedge');
  expect(mark?.kind === 'text' && mark.y).toBeLessThan(32);
});

test('doughnut center labels use the middle of their ring and explosion moves their center', () => {
  const original = chart('ctr', '', 'doughnutChart');
  const first = original.series[0]!;
  const normal = labels(original).find(mark => mark.text === 'North')!;
  const exploded = labels({ ...original, series: [{ ...first, explosion: 25 }] }).find(mark => mark.text === 'North')!;
  const box = chartMarksBounds({ measure: measureText }, [normal])!;
  expect(Math.hypot(box.x + box.width / 2 - 240, box.y + box.height / 2 - 160)).toBeCloseTo(96);
  expect(Math.hypot(exploded.x - normal.x, exploded.y - normal.y)).toBeCloseTo(32);
});

test('manual labels retain chart coordinates and draw their authored leader only when enabled', () => {
  const point = `<c:dLbl><c:idx val="1"/><c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.85"/><c:y val="0.05"/></c:manualLayout></c:layout>${flags}</c:dLbl>`;
  const paint = '<c:leaderLines><c:spPr><a:ln w="19050"><a:solidFill><a:srgbClr val="FF00FF"/></a:solidFill><a:prstDash val="dash"/></a:ln></c:spPr></c:leaderLines>';
  for (const enabled of ['0', '1', 'true', 'false']) {
    const model = chart('outEnd', `${point}<c:showLeaderLines val="${enabled}"/>${paint}`);
    const marks = flat(layoutChartScene(model, 480, 320, { measureText }).marks);
    const mark = marks.find(mark => mark.kind === 'text' && mark.text === 'East')!;
    const box = chartMarksBounds({ measure: measureText }, [mark])!;
    expect(box.x).toBeCloseTo(408);
    expect(box.y).toBeCloseTo(16);
    const leaders = marks.filter(mark => mark.kind === 'line' && mark.stroke === '#FF00FF');
    expect(leaders).toHaveLength(enabled === '1' || enabled === 'true' ? 1 : 0);
    if (leaders.length) {
      const leader = leaders[0]!;
      if (leader.kind !== 'line') throw new Error('Expected leader line');
      expect(leader).toMatchObject({ width: 2, strokeDash: [8, 6] });
      for (const [actual, expected] of [[leader.x1, 112], [leader.y1, 160], [leader.x2, 408], [leader.y2, 32]]) expect(actual!).toBeCloseTo(expected!);
    }
  }
});

test('an explicit no-fill stroke suppresses the leader', () => {
  const layout = '<c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.85"/><c:y val="0.05"/></c:manualLayout></c:layout>';
  for (const extra of [
    `<c:dLbl><c:idx val="1"/>${layout}${flags}</c:dLbl><c:showLeaderLines val="1"/><c:leaderLines><c:spPr><a:ln><a:noFill/></a:ln></c:spPr></c:leaderLines>`,
  ]) expect(flat(layoutChartScene(chart('outEnd', extra), 480, 320, { measureText }).marks).filter(mark => mark.kind === 'line')).toHaveLength(0);
});

test('manual leaders inherit partial series line properties and paint above all slices', () => {
  const source = chart('outEnd');
  const first = source.series[0]!;
  const model = {
    ...source,
    dataLabels: { showLeaderLines: true, leaderLineStyle: { color: { kind: 'rgb' as const, value: '#FF00FF' }, width: 1.5 } },
    series: [{ ...first, dataLabels: { ...first.dataLabels, leaderLineStyle: { dash: [4, 3] }, points: {
      0: { layout: { xMode: 'edge' as const, yMode: 'edge' as const, x: .65, y: .2 } },
      1: { layout: { xMode: 'edge' as const, yMode: 'edge' as const, x: .85, y: .05 } },
    } } }],
  };
  const marks = flat(layoutChartScene(model, 480, 320, { measureText }).marks);
  const index = marks.findIndex(mark => mark.kind === 'line' && mark.stroke === '#FF00FF');
  expect(index).toBeGreaterThan(marks.findLastIndex(mark => mark.kind === 'path' && mark.fill !== 'none'));
  expect(marks[index]).toMatchObject({ stroke: '#FF00FF', width: 2, strokeDash: [8, 6] });
  expect(marks.findIndex(mark => mark.kind === 'text' && mark.text in widths)).toBeGreaterThan(marks.findLastIndex(mark => mark.kind === 'line'));
});

test('leaders touch rotated label backgrounds rather than their empty axis-aligned corners', () => {
  const original = chart('outEnd');
  const first = original.series[0]!;
  const model = { ...original, series: [{ ...first, dataLabels: { ...first.dataLabels, showLeaderLines: true,
    points: { 1: { text: 'A long rotated label', fill: { kind: 'rgb' as const, value: '#FFFF00' }, textStyle: { rotation: 45 },
      layout: { xMode: 'edge' as const, yMode: 'edge' as const, x: .65, y: .05 } } } } }] };
  const marks = layoutChartScene(model, 480, 320, { measureText }).marks;
  const line = flat(marks).find(mark => mark.kind === 'line');
  const group = marks.find(mark => mark.kind === 'group' && mark.rotation && mark.marks.some(mark => mark.kind === 'rect' && mark.fill === '#FFFF00'));
  if (line?.kind !== 'line' || group?.kind !== 'group' || !group.rotation) throw new Error('Expected rotated label and leader');
  const box = chartMarksBounds({ measure: measureText }, group.marks)!;
  const { cx, cy } = group.rotation;
  const angle = -group.rotation.angle * Math.PI / 180;
  const x = cx + (line.x2 - cx) * Math.cos(angle) - (line.y2 - cy) * Math.sin(angle);
  const y = cy + (line.x2 - cx) * Math.sin(angle) + (line.y2 - cy) * Math.cos(angle);
  expect(x).toBeGreaterThanOrEqual(box.x - 1e-8);
  expect(x).toBeLessThanOrEqual(box.x + box.width + 1e-8);
  expect(y).toBeGreaterThanOrEqual(box.y - 1e-8);
  expect(y).toBeLessThanOrEqual(box.y + box.height + 1e-8);
  expect(Math.min(Math.abs(x - box.x), Math.abs(x - box.x - box.width), Math.abs(y - box.y), Math.abs(y - box.y - box.height))).toBeLessThan(1e-8);
});

test('split charts paint both plots before their leaders and all label text', () => {
  const point = `<c:dLbl><c:idx val="0"/><c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.85"/><c:y val="0.05"/></c:manualLayout></c:layout>${flags}</c:dLbl>`;
  const paint = '<c:showLeaderLines val="1"/><c:leaderLines><c:spPr><a:ln><a:solidFill><a:srgbClr val="FF00FF"/></a:solidFill></a:ln></c:spPr></c:leaderLines>';
  const original = chart('outEnd', point + paint, 'ofPieChart');
  for (const splitType of ['pie', 'bar'] as const) {
    const marks = flat(layoutChartScene({ ...original, splitType }, 480, 320, { measureText }).marks);
    const leader = marks.findIndex(mark => mark.kind === 'line' && mark.stroke === '#FF00FF');
    expect(leader).toBeGreaterThan(marks.findLastIndex(mark => (mark.kind === 'path' || mark.kind === 'rect') && !!mark.fill && mark.fill !== 'none'));
    expect(marks.findIndex(mark => mark.kind === 'text')).toBeGreaterThan(marks.findLastIndex(mark => mark.kind === 'line'));
  }
});

test('3-D pie label centers and ends follow the projected wedge', () => {
  const original = chart('ctr', '', 'pie3DChart');
  const center = labels(original).find(mark => mark.text === 'North')!;
  const outside = labels(chart('outEnd', '', 'pie3DChart')).find(mark => mark.text === 'North')!;
  const centerBox = chartMarksBounds({ measure: measureText }, [center])!;
  const outsideBox = chartMarksBounds({ measure: measureText }, [outside])!;
  expect(outsideBox.x).toBeGreaterThan(centerBox.x + centerBox.width / 2);
  expect(outsideBox.y).toBeGreaterThan(centerBox.y + centerBox.height / 2);
  expect([center.x, center.y, outside.x, outside.y].every(Number.isFinite)).toBe(true);
});

test('automatic outside labels and a manual label inside the pie have no leader', () => {
  for (const point of ['', `<c:dLbl><c:idx val="1"/><c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.5"/><c:y val="0.5"/></c:manualLayout></c:layout>${flags}</c:dLbl>`]) {
    const model = chart('outEnd', `${point}<c:showLeaderLines val="1"/>`);
    expect(flat(layoutChartScene(model, 480, 320, { measureText }).marks).filter(mark => mark.kind === 'line')).toHaveLength(0);
  }
});
