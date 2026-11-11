import { expect, test } from 'bun:test';
import { createOoxmlChart } from '@tumblerjs/charts';
import { createPresentation, applyPresentationCommand, importNativePresentation } from '../src/index.ts';
import { decodeNativeSlide, encodeNativeSlide } from '../src/native-resources.ts';

function fixture() {
  const source = new TextDecoder().decode(createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'Data', values: [2] }] })).replace(/<c:spPr>[\s\S]*?<\/c:spPr>/, '<c:spPr><a:gradFill><a:gsLst><a:gs pos="0"><a:schemeClr val="accent2"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:path path="circle"/></a:gradFill></c:spPr>');
  let artifact = createPresentation();
  artifact = applyPresentationCommand(artifact, { name: 'insert-chart', slideId: artifact.document.slides[0]!.id, bounds: { x: 20, y: 20, width: 400, height: 300 }, content: { xml: source, resources: { parts: [], relationships: [] } } });
  return importNativePresentation(artifact).state.slides[0]!;
}

test('older compiled chart previews derive current paint semantics from the retained source', () => {
  const native = fixture(), object = native.slide.objects.find(object => object.kind === 'chart')!;
  if (object.chart?.status !== 'supported') throw Error('Expected chart');
  const old = { ...object.chart, series: object.chart.series.map(series => { const { path, ...gradient } = series.gradient!; return { ...series, gradient }; }) };
  const encoded = encodeNativeSlide({ ...native, slide: { ...native.slide, objects: native.slide.objects.map(item => item === object ? { ...item, chart: old } : item) } });
  const restored = decodeNativeSlide(encoded.model, encoded.resources).slide.objects.find(object => object.kind === 'chart')!;
  expect(restored.chartContent).toEqual(object.chartContent);
  if (restored.chart?.status !== 'supported') throw Error('Expected restored chart');
  expect(restored.chart.series[0]?.gradient?.path).toBe('circle');
  expect(restored.chart.themeColors).toEqual(object.chart.themeColors);
  expect(restored.chart.themeFonts).toEqual(object.chart.themeFonts);
});

test('current chart views retain stable compiled bytes after opening', () => {
  const encoded = encodeNativeSlide(fixture());
  const restored = decodeNativeSlide(encoded.model, encoded.resources);
  const again = encodeNativeSlide(restored);
  expect(again.model).toEqual(encoded.model);
});

for (const complete of [false, true]) test(`chart model refresh ${complete ? 'uses the known resource graph' : 'retains older image handles'}`, () => {
  const native = fixture(), object = native.slide.objects.find(object => object.kind === 'chart')!;
  if (object.chart?.status !== 'supported' || !object.chartContent) throw Error('Expected chart');
  const image = { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' };
  const content = { xml: object.chartContent.xml, ...(complete ? { resources: { parts: [], relationships: [] } } : {}) };
  const encoded = encodeNativeSlide({ ...native, slide: { ...native.slide, objects: [{ ...object, chartContent: content, chart: { ...object.chart, images: { oldImage: image } } }] } });
  const restored = decodeNativeSlide(encoded.model, encoded.resources).slide.objects[0]!;
  if (complete) expect(restored.chart?.images?.oldImage).toBeUndefined();
  else expect(restored.chart?.images?.oldImage?.bytes).toEqual(image.bytes);
});

test('chart models in insertion templates refresh from source too', () => {
  const native = fixture(), object = native.slide.objects.find(object => object.kind === 'chart')!;
  if (object.chart?.status !== 'supported') throw Error('Expected chart');
  const old = { ...object, chart: { ...object.chart, series: object.chart.series.map(series => { const { path, ...gradient } = series.gradient!; return { ...series, gradient }; }) } };
  const insertion = { slide: { ...native.slide, objects: [old] }, palette: native.palette, inheritedBackground: native.inheritedBackground };
  const encoded = encodeNativeSlide({ ...native, insertion });
  const restored = decodeNativeSlide(encoded.model, encoded.resources).insertion?.slide.objects[0]?.chart;
  if (restored?.status !== 'supported') throw Error('Expected template chart');
  expect(restored.series[0]?.gradient?.path).toBe('circle');
});
