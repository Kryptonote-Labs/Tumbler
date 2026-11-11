import { expect, test } from 'bun:test';
import { convertChartConformance, convertChartType, createOoxmlChart, parseOoxmlChart, layoutChartScene, type ChartMark } from '../src/index.ts';
const flatten = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flatten(mark.marks) : [mark]);
const data = { categories: ['A', 'B', 'C'], series: [{ name: 'Data', values: [2, 4, 3], xValues: [1, 2, 3] }] };
function model(xml: Uint8Array) { const parsed = parseOoxmlChart(xml, 'transitional'); if (parsed.status !== 'supported') throw Error(parsed.reason); return parsed; }

test('new axes explicitly remain visible in Office and contour value axes explicitly stay hidden', () => {
  for (const type of ['barChart', 'surfaceChart'] as const) {
    const bytes = createOoxmlChart({ ...data, type });
    expect(new TextDecoder().decode(bytes)).toContain('<c:delete val="0"/>');
    expect(model(bytes).axes.find(axis => axis.kind === 'value')?.deleted).toBe(type === 'surfaceChart');
  }
});

for (const scatterStyle of ['none', 'marker', 'line', 'lineMarker', 'smooth', 'smoothMarker'] as const) test(`new scatter ${scatterStyle} authors its line and marker intent`, () => {
  const parsed = model(createOoxmlChart({ ...data, type: 'scatterChart', scatterStyle }));
  const series = parsed.series[0]!;
  const hasLine = !['marker', 'none'].includes(scatterStyle), hasMarker = ['marker', 'lineMarker', 'smoothMarker'].includes(scatterStyle);
  expect(series.lineStyle?.noFill === true).toBe(!hasLine);
  expect(series.marker?.symbol).toBe(hasMarker ? 'circle' : 'none');
  expect(series.smooth).toBe(scatterStyle.startsWith('smooth'));
  const paths = flatten(layoutChartScene(parsed, 500, 350).marks).filter(mark => mark.kind === 'path' && mark.stroke === '#4472C4');
  expect(paths.length > 0).toBe(hasLine);
  if (hasLine) expect(paths.some(mark => mark.kind === 'path' && mark.d.includes('C'))).toBe(scatterStyle.startsWith('smooth'));
});

test('an authored scatter line and explicit smooth flag override plot shortcuts', () => {
  const source = new TextDecoder().decode(createOoxmlChart({ ...data, type: 'scatterChart', scatterStyle: 'marker' })).replace('<a:ln><a:noFill/></a:ln>', '<a:ln><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln>');
  const parsed = model(new TextEncoder().encode(source));
  const paths = flatten(layoutChartScene(parsed, 500, 350).marks).filter(mark => mark.kind === 'path' && mark.stroke === '#4472C4');
  expect(paths).toHaveLength(1);
  expect(paths[0]?.kind === 'path' && paths[0].d.includes('C')).toBe(false);
});

test('automatic pie colours vary while an authored series fill replaces that palette', () => {
  const original = model(createOoxmlChart({ ...data, type: 'pieChart' }));
  const fills = (parsed: typeof original) => flatten(layoutChartScene(parsed, 500, 350).marks).filter(mark => mark.kind === 'path').map(mark => mark.fill);
  expect(new Set(fills(original)).size).toBe(3);
  expect(new Set(fills({ ...original, series: original.series.map(series => ({ ...series, fill: { kind: 'rgb', value: '#123456' } })) }))).toEqual(new Set(['#123456']));
  const multiple = { ...original, series: [...original.series, { ...original.series[0]!, index: 1, order: 1 }] };
  expect(new Set(fills(multiple)).size).toBe(1);
});

test('bubble opacity comes from authored paint instead of an extra transparency multiplier', () => {
  const parsed = model(createOoxmlChart({ ...data, type: 'bubbleChart', series: data.series.map(series => ({ ...series, bubbleSizes: [2, 3, 4] })) }));
  const bubbles = flatten(layoutChartScene(parsed, 500, 350).marks).filter(mark => mark.kind === 'circle');
  expect(bubbles).toHaveLength(4);
  expect(bubbles.every(mark => mark.fillOpacity === undefined)).toBe(true);
});


test('changing scatter gallery styles updates series visibility and retains authored paint', () => {
  const source = createOoxmlChart({ ...data, type: 'scatterChart', scatterStyle: 'lineMarker' });
  const markers = convertChartType(source, { type: 'scatterChart', scatterStyle: 'marker' });
  expect(model(markers).series[0]).toMatchObject({ lineStyle: { noFill: true }, marker: { symbol: 'circle' }, smooth: false });
  const smooth = convertChartType(markers, { type: 'scatterChart', scatterStyle: 'smooth' });
  expect(model(smooth).series[0]).toMatchObject({ marker: { symbol: 'none' }, smooth: true });
  expect(model(smooth).series[0]?.lineStyle?.noFill).not.toBe(true);
  expect(model(smooth).series[0]?.fill).toEqual(model(source).series[0]?.fill);
});


test('scatter visibility round trips retain custom line paint through multiple hidden styles', () => {
  const source = new TextDecoder().decode(createOoxmlChart({ ...data, type: 'scatterChart', scatterStyle: 'line' })).replace('<a:ln><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln>', '<a:ln w="25400" cap="rnd"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:prstDash val="dash"/></a:ln>');
  let changed: Uint8Array = new TextEncoder().encode(source);
  for (const scatterStyle of ['marker', 'none', 'marker', 'line'] as const) changed = convertChartType(changed, { type: 'scatterChart', scatterStyle });
  expect(model(changed).series[0]?.lineStyle).toMatchObject({ color: { kind: 'rgb', value: '#FF0000' }, width: 2, cap: 'round' });
});

test('a point marker overrides a hidden plot marker without enabling other points', () => {
  const original = model(createOoxmlChart({ ...data, type: 'scatterChart', scatterStyle: 'line' }));
  const parsed = { ...original, legend: undefined, series: original.series.map(({ marker, ...series }) => ({ ...series, pointFormats: [{ index: 1, marker: { symbol: 'circle' as const } }] })) };
  const circles = flatten(layoutChartScene(parsed, 500, 350).marks).filter(mark => mark.kind === 'circle');
  expect(circles).toHaveLength(1);
});


test('hidden scatter line paint restores into the current host conformance', () => {
  const source = createOoxmlChart({ ...data, type: 'scatterChart', scatterStyle: 'line' });
  const hidden = convertChartType(source, { type: 'scatterChart', scatterStyle: 'marker' });
  const strict = convertChartConformance(hidden, 'strict');
  const visible = convertChartType(strict, { type: 'scatterChart', scatterStyle: 'line' });
  const parsed = parseOoxmlChart(visible, 'strict');
  if (parsed.status !== 'supported') throw Error(parsed.reason);
  expect(parsed.series[0]?.lineStyle?.color).toMatchObject({ kind: 'scheme', value: 'accent1' });
});
