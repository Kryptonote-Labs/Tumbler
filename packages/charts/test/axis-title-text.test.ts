import { expect, test } from 'bun:test';
import { createOoxmlChart, layoutCartesianChart, layoutChartScene, parseOoxmlChart, type ChartMark, type CreateChartOptions } from '../src/index.ts';
import { chartMarksBounds } from '../src/shape-scene.ts';

const manual = '<c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.2"/><c:y val="0.25"/></c:manualLayout></c:layout>';
const paragraphs = '<a:p><a:r><a:rPr sz="1800" b="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr><a:t>Revenue</a:t></a:r><a:r><a:rPr sz="1200" i="1" u="sng"><a:solidFill><a:srgbClr val="0000FF"/></a:solidFill></a:rPr><a:t> USD</a:t></a:r></a:p>';
const paint = '<c:spPr><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="111111"/></a:solidFill></a:ln></c:spPr>';
const flat = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flat(mark.marks) : [mark]);
const measure = { measure: (value: string, font: { size: number }) => value.length * font.size * .55 };
function source(type: CreateChartOptions['type'], title: string, conformance: 'strict' | 'transitional' = 'transitional') {
  return new TextDecoder().decode(createOoxmlChart({ type, conformance, categories: ['A', 'B', 'C'], series: [{ name: 'Data', values: [2, 4, 3], xValues: [1, 2, 3], bubbleSizes: [1, 2, 3] }] })).replace(/(<c:valAx>[\s\S]*?<c:axPos\b[^>]*\/>)(<c:majorGridlines\/>|)/, `$1$2${title}`);
}
function parse(xml: string, conformance: 'strict' | 'transitional' = 'transitional') {
  const model = parseOoxmlChart(new TextEncoder().encode(xml), conformance);
  if (model.status !== 'supported') throw new Error(model.reason);
  return model;
}
const title = (angle: number, layout = manual, rich = paragraphs) => `<c:title><c:tx><c:rich><a:bodyPr rot="${angle * 60000}"/><a:lstStyle/>${rich}</c:rich></c:tx>${layout}${paint}</c:title>`;

test('strict and transitional axis titles keep individual rich runs and their native shape', () => {
  for (const conformance of ['strict', 'transitional'] as const) {
    const axis = parse(source('barChart', title(45), conformance), conformance).axes.find(axis => axis.kind === 'value')!;
    expect(axis.titleText?.[0]?.runs.map(run => run.text)).toEqual(['Revenue', ' USD']);
    expect(axis.titleText?.[0]?.runs[0]?.style).toMatchObject({ fontSize: 18, bold: true, color: { value: '#FF0000' } });
    expect(axis.titleShape).toMatchObject({ fill: { value: '#00FF00' }, lineStyle: { width: 1 } });
    expect(axis.titleStyle?.rotation).toBe(45);
  }
});

test('rich axis titles rotate their text, decorations and frame at the same manual position', () => {
  for (const type of ['barChart', 'scatterChart', 'bar3DChart'] as const) for (const angle of [0, 45, -90]) {
    const scene = layoutChartScene(parse(source(type, title(angle))), 600, 400);
    const contents = flat(scene.marks), red = contents.find(mark => mark.kind === 'text' && mark.text === 'Revenue'), blue = contents.find(mark => mark.kind === 'text' && mark.text === ' USD');
    expect(red).toMatchObject({ font: { size: 24, weight: 700, color: '#FF0000' }, rotate: angle });
    expect(blue).toMatchObject({ font: { size: 16, italic: true, color: '#0000FF' }, rotate: angle });
    expect(contents.some(mark => mark.kind === 'line' && mark.stroke === '#0000FF')).toBe(true);
    const background = scene.marks.find(mark => mark.kind === 'group' && mark.rotation?.angle === angle && flat(mark.marks).some(child => child.kind === 'rect' && child.fill === '#00FF00'))
      ?? scene.marks.find(mark => mark.kind === 'rect' && mark.fill === '#00FF00');
    expect(background).toBeDefined();
    expect(chartMarksBounds(measure, [background!])).toMatchObject({ x: expect.closeTo(120), y: expect.closeTo(100) });
  }
});

test('automatic multiline rich axis titles reserve space and clear the chart title and legend', () => {
  const rich = `${paragraphs}<a:p><a:r><a:rPr sz="2400"/><a:t>Second line</a:t></a:r></a:p>`;
  for (const type of ['barChart', 'scatterChart', 'bar3DChart'] as const) {
    const model = parse(source(type, title(0, '', rich)));
    const scene = layoutChartScene({ ...model, title: 'Main title', legend: { ...model.legend!, position: 'bottom' } }, 600, 400);
    const labels = flat(scene.marks).filter(mark => mark.kind === 'text' && ['Revenue', ' USD', 'Second line'].includes(mark.text));
    const bounds = chartMarksBounds(measure, labels)!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(600);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(400);
    const legend = scene.marks.find(mark => mark.kind === 'group' && mark.role === 'legend')!;
    const legendBounds = chartMarksBounds(measure, [legend])!;
    expect(bounds.x + bounds.width <= legendBounds.x || legendBounds.x + legendBounds.width <= bounds.x || bounds.y + bounds.height <= legendBounds.y || legendBounds.y + legendBounds.height <= bounds.y).toBe(true);
  }
});

test('cached worksheet axis titles retain their title-wide font and shape', () => {
  const cached = `<c:title><c:tx><c:strRef><c:f>Data!A1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Cached units</c:v></c:pt></c:strCache></c:strRef></c:tx>${manual}${paint}<c:txPr><a:bodyPr rot="0"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1800" b="1"/></a:pPr></a:p></c:txPr></c:title>`;
  const scene = layoutChartScene(parse(source('barChart', cached)), 600, 400);
  expect(flat(scene.marks).find(mark => mark.kind === 'text' && mark.text === 'Cached units')).toMatchObject({ font: { size: 24, weight: 700 } });
  expect(scene.marks.find(mark => mark.kind === 'rect' && mark.fill === '#00FF00')).toMatchObject({ x: expect.closeTo(120), y: expect.closeTo(100) });
});

test('contour plots render rich category, value and depth titles at their authored positions', () => {
  const original = source('surfaceChart', '');
  for (const owner of ['catAx', 'valAx', 'serAx']) {
    const xml = original.replace(new RegExp(`(<c:${owner}>[\\s\\S]*?<c:axPos\\b[^>]*\\/>)(<c:majorGridlines\\/>|)`), `$1$2${title(45)}`);
    const scene = layoutChartScene(parse(xml), 600, 400);
    expect(flat(scene.marks).find(mark => mark.kind === 'text' && mark.text === 'Revenue')).toMatchObject({ rotate: 45, font: { weight: 700, color: '#FF0000' } });
    const group = scene.marks.find(mark => mark.kind === 'group' && mark.rotation?.angle === 45 && flat(mark.marks).some(child => child.kind === 'rect' && child.fill === '#00FF00'))!;
    expect(chartMarksBounds(measure, [group])).toMatchObject({ x: expect.closeTo(120), y: expect.closeTo(100) });
  }
});

test('hiding Cartesian, XY and 3-D axis spines keeps their independently authored title', () => {
  for (const type of ['barChart', 'scatterChart', 'bar3DChart'] as const) {
    const xml = source(type, title(45)).replace(/<c:valAx>[\s\S]*?<\/c:valAx>/, block => block.replace('<c:delete val="0"/>', '<c:delete val="1"/>'));
    const scene = layoutChartScene(parse(xml), 600, 400);
    expect(flat(scene.marks).some(mark => mark.kind === 'text' && mark.text === 'Revenue' && mark.rotate === 45)).toBe(true);
  }
});

test('unrotated rich depth-axis titles reserve their full horizontal width', () => {
  for (const type of ['bar3DChart', 'surface3DChart'] as const) {
    const original = source(type, '');
    const xml = original.replace(/(<c:serAx>[\s\S]*?<c:axPos\b[^>]*\/>)/, `$1${title(0, '').replace(' rot="0"', '')}`);
    const model = { ...parse(xml), grouping: 'standard' as const };
    const scene = layoutChartScene(model, 600, 400);
    const text = flat(scene.marks).find(mark => mark.kind === 'text' && mark.text === 'Revenue');
    expect(text).toMatchObject({ rotate: 0 });
    const background = scene.marks.find(mark => mark.kind === 'rect' && mark.fill === '#00FF00')!;
    const bounds = chartMarksBounds(measure, [background])!, plot = layoutCartesianChart(model, 600, 400).plot;
    expect(bounds.x).toBeGreaterThan(plot.x + plot.width);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(600);
  }
});

test('combination charts paint a shared axis title once even when its spine is hidden', () => {
  for (const deleted of [false, true]) {
    const original = parse(source('barChart', title(45)));
    const primary = { ...original, axes: original.axes.map(axis => axis.title ? { ...axis, deleted } : axis) };
    const secondary = { ...primary, kind: 'line' as const, sourceType: 'lineChart', series: primary.series.map(series => ({ ...series, index: series.index + 10 })) };
    const scene = layoutChartScene({ ...primary, plots: [primary, secondary], series: [...primary.series, ...secondary.series] }, 600, 400);
    const marks = flat(scene.marks);
    expect(marks.filter(mark => mark.kind === 'text' && mark.text === 'Revenue')).toHaveLength(1);
    expect(marks.filter(mark => mark.kind === 'rect' && mark.fill === '#00FF00')).toHaveLength(1);
  }
});
