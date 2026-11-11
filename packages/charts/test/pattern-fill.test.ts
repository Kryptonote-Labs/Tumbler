import { expect, test } from 'bun:test';
import { createCanvas, loadImage, Path2D } from '@napi-rs/canvas';
import { DRAWING_PATTERN_PRESETS } from '@tumblerjs/ooxml';
import { OOXML_CHART_TYPES, chartScenePictures, chartContentModel, createOoxmlChart, layoutChartScene, paintChartScene, type ChartMark } from '../src/index.ts';
const flatten = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flatten(mark.marks) : [mark]);
const fill = '<a:pattFill prst="horz"><a:fgClr><a:schemeClr val="accent1"><a:alpha val="50000"/></a:schemeClr></a:fgClr><a:bgClr><a:srgbClr val="FFFFFF"/></a:bgClr></a:pattFill>';
function source(type: typeof OOXML_CHART_TYPES[number] = 'barChart', preset = 'horz') {
  let xml = new TextDecoder().decode(createOoxmlChart({ type, categories: ['A', 'B', 'C', 'D'], series: [
    { name: 'Open', values: [2, 4, 3, 5], xValues: [1, 2, 3, 4], bubbleSizes: [1, 3, 2, 4] },
    { name: 'High', values: [5, 7, 6, 8] }, { name: 'Low', values: [1, 2, 1, 2] }, { name: 'Close', values: [3, 5, 4, 6] },
  ].map(series => ({ ...series, bubbleSizes: [1, 3, 2, 4] })) })).replace(/<c:spPr>[\s\S]*?<\/c:spPr>/g, `<c:spPr>${fill.replace('prst="horz"', `prst="${preset}"`)}</c:spPr>`);
  if (type === 'surfaceChart' || type === 'surface3DChart') xml = xml.replace('<c:axId', `<c:bandFmts>${Array.from({ length: 16 }, (_, index) => `<c:bandFmt><c:idx val="${index}"/><c:spPr>${fill}</c:spPr></c:bandFmt>`).join('')}</c:bandFmts><c:axId`);
  return xml;
}
test.each([...DRAWING_PATTERN_PRESETS])('chart fills retain the %s preset and theme colour transforms', preset => {
  const model = chartContentModel({ xml: source('barChart', preset) });
  if (model.status !== 'supported') throw Error(model.reason);
  const scene = layoutChartScene({ ...model, themeColors: { accent1: '#123456' } }, 320, 200, { patternOrigin: { x: 3, y: 5 } });
  const pattern = flatten(scene.marks).find(mark => mark.fillPattern)?.fillPattern;
  expect(pattern).toMatchObject({ origin: { x: 3, y: 5 }, pattern: { preset, foreground: 'rgba(18,52,86,0.5)', background: '#FFFFFF' } });
});
test.each([...OOXML_CHART_TYPES])('%s paints native patterns with enumerated tile images', async type => {
  const model = chartContentModel({ xml: source(type) });
  if (model.status !== 'supported') throw Error(model.reason);
  const scene = layoutChartScene(model, 320, 200);
  expect(flatten(scene.marks).some(mark => mark.fillPattern)).toBe(true);
  const canvas = createCanvas(320, 200);
  const images = new Map(await Promise.all(chartScenePictures(scene).map(async picture => { const image = await loadImage(Buffer.from(picture.bytes)); return [picture, { image, width: image.width, height: image.height }] as const; })));
  paintChartScene(canvas.getContext('2d'), scene, d => new Path2D(d), { image: picture => images.get(picture) });
  expect(canvas.getContext('2d').getImageData(160, 100, 1, 1).data[3]).toBe(255);
});
test('a solid point replaces an inherited pattern as one fill choice', () => {
  const model = chartContentModel({ xml: source() });
  if (model.status !== 'supported') throw Error(model.reason);
  const scene = layoutChartScene({ ...model, series: [{ ...model.series[0]!, pointFormats: [{ index: 0, fill: { kind: 'rgb', value: '#00FF00' } }] }] }, 320, 200);
  const bars = flatten(scene.marks).filter(mark => mark.kind === 'rect' && mark.width > 15 && mark.width < 100);
  expect(bars.some(mark => mark.fillPattern)).toBe(true);
  expect(bars.some(mark => mark.kind === 'rect' && mark.fill === '#00FF00' && !mark.fillPattern)).toBe(true);
});
