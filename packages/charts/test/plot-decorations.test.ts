import { expect, test } from 'bun:test';
import { createOoxmlChart, parseOoxmlChart, layoutChartScene, layoutCartesianChart, type ChartMark } from '../src/index.ts';
import { cartesianGeometry } from '../src/cartesian-geometry.ts';

const flatten = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flatten(mark.marks) : [mark]);
function stock(open = false) {
  const bytes = createOoxmlChart({ type: 'stockChart', categories: ['A', 'B'], series: [
    ...(open ? [{ name: 'Open', values: [4, 8] }] : []), { name: 'High', values: [9, 10] }, { name: 'Low', values: [2, 3] }, { name: 'Close', values: [7, 5] },
  ] });
  const model = parseOoxmlChart(bytes, 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  return { bytes, model };
}

test('new stock sources author high-low-close markers and four-series up/down bars', () => {
  const hlc = stock().model, ohlc = stock(true).model;
  expect(hlc.highLowLines).toEqual({});
  expect(hlc.series.map(series => series.marker?.symbol)).toEqual(['none', 'none', 'dash']);
  const closes = flatten(layoutChartScene(hlc, 600, 400).marks).filter(mark => mark.kind === 'path' && mark.stroke && mark.stroke !== 'none' && (mark.strokeWidth ?? 1) > 0);
  expect(closes).toHaveLength(2);
  expect(ohlc.upDownBars?.gapWidth).toBe(150);
  expect(ohlc.series.every(series => series.lineStyle?.noFill)).toBe(true);
  const marks = flatten(layoutChartScene(ohlc, 600, 400).marks).filter(mark => mark.kind === 'rect');
  expect(marks.some(mark => mark.fill === '#ffffff' && mark.stroke === '#595959')).toBe(true);
  expect(marks.some(mark => mark.fill === '#595959' && mark.stroke === '#595959')).toBe(true);
});

test('stock prices and high-low lines honor reversed logarithmic axes and shared date positions', () => {
  const original = stock().model;
  const model = { ...original, highLowLines: { color: { kind: 'rgb' as const, value: '#FF00FF' } }, axes: original.axes.map(axis => ({ ...axis, reversed: true, ...(axis.kind === 'value' ? { logBase: 10, minimum: 1, maximum: 100 } : {}) })) };
  const layout = layoutCartesianChart(model, 600, 400), projection = cartesianGeometry(model, layout);
  const lines = flatten(layoutChartScene(model, 600, 400).marks).filter(mark => mark.kind === 'line' && mark.stroke === '#FF00FF');
  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatchObject({ x1: projection.category(0), x2: projection.category(0), y1: projection.value(2), y2: projection.value(9) });
  expect(projection.category(0)).toBeGreaterThan(projection.category(1));
  expect(projection.value(2)).toBeLessThan(projection.value(9));
});

test('line high-low, drop and up/down styles retain explicit hidden lines and bar widths', () => {
  const original = stock(true).model;
  const model = { ...original, kind: 'line' as const, dropLines: { noFill: true }, highLowLines: { color: { kind: 'rgb' as const, value: '#00AABB' }, dash: [3, 1] }, upDownBars: { gapWidth: 0, upBars: { fill: { kind: 'rgb' as const, value: '#00FF00' } }, downBars: { noFill: true, lineStyle: { noFill: true } } } };
  const marks = flatten(layoutChartScene(model, 600, 400).marks);
  expect(marks.filter(mark => mark.kind === 'line' && mark.stroke === '#00AABB')).toHaveLength(2);
  const bar = marks.filter(mark => mark.kind === 'rect').find(mark => mark.fill === '#00FF00');
  expect(bar?.width).toBeCloseTo(cartesianGeometry(model, layoutCartesianChart(model, 600, 400)).band);
  expect(marks.filter(mark => mark.kind === 'rect' && mark.fill === '#595959')).toHaveLength(0);
});

test('stock source lines use authored dashes and colours through the parser', () => {
  const source = new TextDecoder().decode(stock().bytes).replace('<c:hiLowLines/>', '<c:hiLowLines><c:spPr><a:ln w="25400"><a:solidFill><a:srgbClr val="123456"/></a:solidFill><a:prstDash val="dash"/></a:ln></c:spPr></c:hiLowLines>');
  const model = parseOoxmlChart(new TextEncoder().encode(source), 'transitional');
  expect(model.status).toBe('supported');
  if (model.status !== 'supported') throw new Error(model.reason);
  expect(model.highLowLines).toMatchObject({ width: 2, color: { value: '#123456' }, dash: [4, 3] });
  expect(flatten(layoutChartScene(model, 600, 400).marks).filter(mark => mark.kind === 'line' && mark.stroke === '#123456')).toHaveLength(2);
});

test('volume and stock plots keep independent axes in a shared combination', async () => {
  const { chartXml, standaloneChartElement } = await import('../src/source-xml.ts');
  const prices = chartXml(stock().bytes), volume = chartXml(createOoxmlChart({ type: 'barChart', categories: ['A', 'B'], series: [{ name: 'Volume', values: [1000, 2000] }] }));
  const plot = (source: typeof prices) => source.children(source.plotArea).find(node => node.localName.endsWith('Chart'))!;
  const volumePlot = standaloneChartElement(volume.document, plot(volume)).replace('<c:idx val="0"/>', '<c:idx val="4"/>');
  const pricePlot = standaloneChartElement(prices.document, plot(prices)).replaceAll('<c:axId val="1"/>', '<c:axId val="3"/>').replaceAll('<c:axId val="2"/>', '<c:axId val="4"/>');
  const axes = (source: typeof prices) => source.children(source.plotArea).filter(node => node.localName.endsWith('Ax')).map(node => standaloneChartElement(source.document, node)).join('');
  const priceAxes = axes(prices).replaceAll('val="1"', 'val="3"').replaceAll('val="2"', 'val="4"').replace('val="l"', 'val="r"');
  const xml = new TextDecoder().decode(stock().bytes).replace(/<c:plotArea>[\s\S]*?<\/c:plotArea>/, `<c:plotArea>${volumePlot}${pricePlot}${axes(volume)}${priceAxes}</c:plotArea>`);
  const model = parseOoxmlChart(new TextEncoder().encode(xml), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  expect(model.plots?.map(plot => plot.kind)).toEqual(['column', 'stock']);
  const { layoutCombinationChart } = await import('../src/index.ts');
  const layouts = layoutCombinationChart(model, 600, 400);
  expect(layouts[0]!.maximum).toBeGreaterThan(1000);
  expect(layouts[1]!.maximum).toBeLessThan(100);
  const scene = layoutChartScene(model, 600, 400);
  expect(scene.label).not.toBe('Chart preview unavailable');
  expect(flatten(scene.marks).filter(mark => mark.kind === 'path' && mark.fill === 'none')).not.toHaveLength(0);
});


test('high-low-close ticks start at the category stem and extend to the right', () => {
  const model = stock().model, layout = layoutCartesianChart(model, 600, 400), projection = cartesianGeometry(model, layout);
  const ticks = flatten(layoutChartScene(model, 600, 400).marks).filter(mark => mark.kind === 'path' && mark.stroke === '#000000');
  expect(ticks).toHaveLength(2);
  const x = projection.category(0), y = projection.value(7);
  expect(ticks[0]).toMatchObject({ d: `M ${x} ${y} L ${x + projection.band / 5} ${y}` });
});
