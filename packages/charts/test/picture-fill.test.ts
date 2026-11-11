import { expect, test } from 'bun:test';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { paintDrawingPicture } from '@tumblerjs/ooxml';
import { createWordArtifact, layoutWordDocument, canvasWordTextMeasurer, wordPageChartPictures, paintWordPage } from '../../word/src/index.ts';
import { createPresentation, applyPresentationCommand, importNativePresentation, presentationSlideImages, paintPresentationSlide } from '../../slides/src/index.ts';
import { createSpreadsheet, applySpreadsheetCommand } from '../../sheets/src/index.ts';
import { openOpcPackage } from '@tumblerjs/opc';
import { pieFillBounds } from '../src/pie-fill-bounds.ts';
import { chartBytesToBase64, chartContentModel, chartScenePictures, createOoxmlChart, layoutChartScene, paintChartScene, readChartModel, chartPropertyTree, canSetChartPicture, setChartPictureFill, OOXML_CHART_TYPES, type ChartMark, type ChartResources } from '../src/index.ts';

const image = createCanvas(2, 2); image.getContext('2d').fillStyle = '#ff0000'; image.getContext('2d').fillRect(0, 0, 2, 2);
const resources: ChartResources = { parts: [{ key: 'image', contentType: 'image/png', data: chartBytesToBase64(image.toBuffer('image/png')) }], relationships: [{ id: 'image', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target: 'image' }] };
const source = new TextDecoder().decode(createOoxmlChart({ type: 'barChart', categories: ['A', 'B'], series: [{ name: 'Data', values: [2, 4] }] }));
const xml = source.replace(/<c:spPr>[\s\S]*?<\/c:spPr>/, '<c:spPr><a:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="image"><a:alphaModFix amt="50000"/></a:blip><a:srcRect l="25%"/><a:stretch><a:fillRect r="25000"/></a:stretch></a:blipFill></c:spPr>');
const content = { xml, resources };
const flatten = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flatten(mark.marks) : [mark]);

test('portable picture fills retain source geometry and replace inherited fills as a unit', () => {
  const model = chartContentModel(content);
  if (model.status !== 'supported') throw new Error(model.reason);
  expect(model.series[0]?.picture).toMatchObject({ relationshipId: 'image', crop: [.25, 0, 0, 0], opacity: .5, stretch: [0, 0, .25, 0] });
  const scene = layoutChartScene(model, 400, 300), pictures = chartScenePictures(scene);
  expect(pictures).toHaveLength(1);
  expect(chartScenePictures(layoutChartScene(model, 400, 300))[0]).toBe(pictures[0]);
  expect(chartContentModel(content).images?.image?.bytes).toBe(model.images?.image?.bytes);
  expect(flatten(scene.marks).filter(mark => mark.fillPicture)).toHaveLength(3);
  const solidPoint = { index: 0, fill: { kind: 'rgb' as const, value: '#00FF00' } };
  expect(flatten(layoutChartScene({ ...model, series: model.series.map(series => ({ ...series, pointFormats: [solidPoint] })) }, 400, 300).marks).filter(mark => mark.fillPicture)).toHaveLength(2);
});

test('canvas picture callbacks receive the same stable images that were enumerated and stay clipped', () => {
  const model = chartContentModel(content); if (model.status !== 'supported') throw new Error(model.reason);
  const scene = layoutChartScene(model, 400, 300), pictures = new Set(chartScenePictures(scene));
  const canvas = createCanvas(400, 300), context = canvas.getContext('2d'); let calls = 0;
  paintChartScene(context, scene, d => new Path2D(d), { picture: (fill, width, height) => { expect(pictures.has(fill)).toBe(true); calls++; paintDrawingPicture(context, fill, width, height, { image, width: 2, height: 2 }); } });
  expect(calls).toBe(3);
  expect(context.getImageData(0, 0, 1, 1).data[0]).not.toBe(255);
});

test('native Word, slides and spreadsheets resolve embedded chart images from package relationships', () => {
  const word = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: { width: 300, height: 200, content } }] }] });
  const presentation = createPresentation(), slideId = presentation.document.slides[0]!.id;
  const slides = applyPresentationCommand(presentation, { name: 'insert-chart', slideId, bounds: { x: 10, y: 10, width: 400, height: 300 }, content });
  const sheets = applySpreadsheetCommand(createSpreadsheet(), { name: 'insert-chart', sheetId: '1', x: 10, y: 10, width: 400, height: 300, content });
  for (const bytes of [word.bytes(), slides.bytes(), sheets.bytes()]) {
    const pkg = openOpcPackage(bytes), part = pkg.parts.find(part => part.contentType.endsWith('drawingml.chart+xml'))!;
    const model = readChartModel(pkg, part.name, 'transitional');
    if (model.status !== 'supported') throw new Error(model.reason);
    expect(chartScenePictures(layoutChartScene(model, 400, 300))).toHaveLength(1);
  }
  const page = layoutWordDocument(word.document, canvasWordTextMeasurer(createCanvas(1, 1).getContext('2d'))).pages[0]!;
  const pagePictures = new Set(wordPageChartPictures(page)), wordCanvas = createCanvas(800, 800); let wordCalls = 0;
  paintWordPage(wordCanvas.getContext('2d'), page, { path: d => new Path2D(d), chartImage: picture => { expect(pagePictures.has(picture)).toBe(true); wordCalls++; return { image, width: 2, height: 2 }; } });
  expect(wordCalls).toBeGreaterThan(0);
  const native = importNativePresentation(slides), objectKey = native.document.slides[0]!.objects.find(object => object.kind === 'chart')!.key;
  const changed = applyPresentationCommand(native, { name: 'edit-chart', slideId, objectKey, content: { xml } });
  const slide = changed.document.slides[0]!, slidePictures = new Set(presentationSlideImages(slide)); let slideCalls = 0;
  expect(slidePictures.size).toBe(1);
  paintPresentationSlide(createCanvas(800, 600).getContext('2d'), changed.document, slide, { path: d => new Path2D(d), image: picture => { expect(slidePictures.has(picture)).toBe(true); slideCalls++; return { image, width: 2, height: 2 }; } });
  expect(slideCalls).toBeGreaterThan(0);
});

test('a failed picture painter restores nested clips and transforms for the caller', () => {
  const canvas = createCanvas(40, 40), context = canvas.getContext('2d');
  const picture = { bytes: new Uint8Array(), contentType: 'image/png', crop: [0, 0, 0, 0] as const };
  expect(() => paintChartScene(context, { width: 40, height: 40, label: '', marks: [{ kind: 'group', clip: { x: 0, y: 0, width: 10, height: 10 }, marks: [{ kind: 'rect', x: 2, y: 2, width: 4, height: 4, fill: 'none', fillPicture: { picture, bounds: { x: 2, y: 2, width: 4, height: 4 } } }] }] }, d => new Path2D(d), { picture: () => { throw new Error('decode failed'); } })).toThrow('decode failed');
  context.fillStyle = '#ff0000'; context.fillRect(30, 30, 2, 2);
  expect([...context.getImageData(30, 30, 1, 1).data]).toEqual([255, 0, 0, 255]);
});

for (const type of OOXML_CHART_TYPES) test(`picture attachment authors a native fill for ${type}`, () => {
  const source = createOoxmlChart({ type, categories: ['A', 'B'], series: [{ name: 'Data', values: [2, 4] }, { name: 'Two', values: [3, 5] }, { name: 'Three', values: [1, 2] }].map(series => ({ ...series, xValues: [1, 2], bubbleSizes: [1, 2] })) });
  const root = chartPropertyTree(source);
  expect(canSetChartPicture(root)).toBe(true);
  const original = { xml: new TextDecoder().decode(source) }, changed = setChartPictureFill(original, root.id, resources.parts[0]!);
  const model = chartContentModel(changed);
  expect(model.chartArea?.picture?.relationshipId).toBe('chart-picture');
    expect(Object.keys(model.images ?? {})).toEqual(['chart-picture']);
  expect(changed.resources?.parts[0]?.data).toBe(resources.parts[0]!.data);
});

test('replacing an image preserves crop, opacity, fill geometry and unrelated assets', () => {
  const root = chartPropertyTree(new TextEncoder().encode(xml)), plotArea = root.children.find(node => node.name === 'c:chart')!.children.find(node => node.name === 'c:plotArea')!;
  const series = plotArea.children.find(node => node.name === 'c:barChart')!.children.find(node => node.name === 'c:ser')!;
  const other = createCanvas(2, 2); other.getContext('2d').fillStyle = '#00ff00'; other.getContext('2d').fillRect(0, 0, 2, 2);
  const image = { data: chartBytesToBase64(other.toBuffer('image/png')), contentType: 'image/png' };
  const changed = setChartPictureFill(content, series.id, image), model = chartContentModel(changed);
  if (model.status !== 'supported') throw new Error(model.reason);
  expect(model.series[0]?.picture).toMatchObject({ crop: [.25, 0, 0, 0], opacity: .5, stretch: [0, 0, .25, 0] });
  expect(changed.resources?.parts).toHaveLength(2);
  expect(changed.resources?.parts[0]?.data).toBe(resources.parts[0]?.data);
  const nextRoot = chartPropertyTree(new TextEncoder().encode(changed.xml)), nextSeries = nextRoot.children.find(node => node.name === 'c:chart')!.children.find(node => node.name === 'c:plotArea')!.children.find(node => node.name === 'c:barChart')!.children.find(node => node.name === 'c:ser')!;
  expect(setChartPictureFill(changed, nextSeries.id, image)).toBe(changed);
});

test('an omitted picture fill mode uses Office tile defaults while an empty stretch remains stretch', () => {
  const tiled = chartContentModel({ ...content, xml: xml.replace('<a:stretch><a:fillRect r="25000"/></a:stretch>', '') });
  if (tiled.status !== 'supported') throw new Error(tiled.reason);
  expect(tiled.series[0]?.picture?.tile).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1, align: 'tl', flip: 'none' });
  const stretched = chartContentModel({ ...content, xml: xml.replace('<a:stretch><a:fillRect r="25000"/></a:stretch>', '<a:stretch/>') });
  if (stretched.status !== 'supported') throw new Error(stretched.reason);
  expect(stretched.series[0]?.picture?.tile).toBeUndefined();
});

test('choosing a picture replaces the prior fill choice while retaining its outline', () => {
  for (const fill of ['<a:solidFill><a:srgbClr val="00FF00"/></a:solidFill>', '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="00FF00"/></a:gs></a:gsLst><a:lin ang="0"/></a:gradFill>']) {
    const input = source.replace(/<c:spPr>[\s\S]*?<\/c:spPr>/, `<c:spPr>${fill}<a:ln w="25400"><a:solidFill><a:srgbClr val="112233"/></a:solidFill></a:ln></c:spPr>`);
    const root = chartPropertyTree(new TextEncoder().encode(input)), series = root.children.find(node => node.name === 'c:chart')!.children.find(node => node.name === 'c:plotArea')!.children.find(node => node.name === 'c:barChart')!.children.find(node => node.name === 'c:ser')!;
    const changed = setChartPictureFill({ xml: input }, series.id, resources.parts[0]!), model = chartContentModel(changed);
    if (model.status !== 'supported') throw new Error(model.reason);
    expect(model.series[0]?.gradient).toBeUndefined();
    expect(model.series[0]?.fill).toBeUndefined();
    expect(model.series[0]?.picture).toBeDefined();
    expect(model.series[0]?.lineStyle).toMatchObject({ width: 2, color: { value: '#112233' } });
  }
});

test('a local picture replacement disconnects its former linked source and retains crop and effects', () => {
  const linked = xml.replace('r:embed="image"', 'r:embed="image" r:link="external"');
  const linkedContent = { xml: linked, resources: { ...resources, relationships: [...resources.relationships, { id: 'external', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target: 'https://example.com/old.png', targetMode: 'External' as const }] } };
  const root = chartPropertyTree(new TextEncoder().encode(linked)), series = root.children.find(node => node.name === 'c:chart')!.children.find(node => node.name === 'c:plotArea')!.children.find(node => node.name === 'c:barChart')!.children.find(node => node.name === 'c:ser')!;
  const changed = setChartPictureFill(linkedContent, series.id, resources.parts[0]!);
  expect(changed.xml).not.toContain('r:link=');
  expect(changed.xml).toContain('<a:alphaModFix amt="50000"/>');
  expect(changed.xml).toContain('<a:srcRect l="25%"/>');
  expect(changed.resources?.relationships).toContainEqual(expect.objectContaining({ id: 'external', targetMode: 'External' }));
});

test('a secondary pie paints its image at the translated subchart position', () => {
  const input = createOoxmlChart({ type: 'ofPieChart', categories: ['A', 'B', 'C'], series: [{ name: 'Data', values: [2, 4, 3] }] });
  const root = chartPropertyTree(input), series = root.children.find(node => node.name === 'c:chart')!.children.find(node => node.name === 'c:plotArea')!.children.find(node => node.name === 'c:ofPieChart')!.children.find(node => node.name === 'c:ser')!;
  const model = chartContentModel(setChartPictureFill({ xml: new TextDecoder().decode(input) }, series.id, resources.parts[0]!));
  if (model.status !== 'supported') throw new Error(model.reason);
  const scene = layoutChartScene(model, 480, 320), canvas = createCanvas(480, 320), context = canvas.getContext('2d');
  paintChartScene(context, scene, d => new Path2D(d), { picture: (fill, width, height) => paintDrawingPicture(context, fill, width, height, { image, width: 2, height: 2 }) });
  const secondary = flatten(scene.marks).filter(mark => mark.kind === 'path' && mark.fillPicture && mark.fillPicture.bounds.x > 240);
  expect(secondary.length).toBeGreaterThan(0);
  const bounds = secondary[0]!.fillPicture!.bounds;
  const sample = [...context.getImageData(Math.floor(bounds.x + bounds.width * .6), Math.floor(bounds.y + bounds.height * .6), 1, 1).data];
  expect(sample).toEqual([255, 0, 0, 255]);
});

test('picture bounds follow a wedge or annular wedge instead of the full pie circle', () => {
  const wedge = pieFillBounds(100, 100, 80, 0, -Math.PI / 2, 0);
  expect(wedge).toMatchObject({ x: 100, y: 20, width: 80, height: 80 });
  const ring = pieFillBounds(0, 0, 100, 50, Math.PI / 4, Math.PI * 3 / 4, .5);
  expect(ring.x).toBeCloseTo(-Math.SQRT1_2 * 100);
  expect(ring.width).toBeCloseTo(Math.SQRT1_2 * 200);
  expect(ring.y).toBeCloseTo(Math.SQRT1_2 * 25);
  expect(ring.height).toBeCloseTo(50 - Math.SQRT1_2 * 25);
});
