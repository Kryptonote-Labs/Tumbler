import { expect, test } from 'bun:test';
import { createPresentation, applyPresentationCommand, presentationChartContent, importNativePresentation, openPresentationArtifact } from '../src/index.ts';
import { createOoxmlChart, convertChartType } from '@tumblerjs/charts';

const content = { xml: new TextDecoder().decode(createOoxmlChart({ type: 'lineChart', categories: ['A', 'B'], series: [{ name: 'Series', values: [2, 4] }] })) };
test('slide charts insert and change type through package commands', () => {
  const empty = createPresentation();
  const slideId = empty.document.slides[0]!.id;
  const inserted = applyPresentationCommand(empty, { name: 'insert-chart', slideId, bounds: { x: 100, y: 80, width: 480, height: 320 }, content });
  const chart = inserted.document.slides[0]!.objects.find(object => object.kind === 'chart')!;
  expect(chart.chart).toMatchObject({ status: 'supported', kind: 'line' });
  const source = presentationChartContent(inserted.document, slideId, chart.key);
  const updated = applyPresentationCommand(inserted, { name: 'edit-chart', slideId, objectKey: chart.key, content: { ...source, xml: new TextDecoder().decode(convertChartType(new TextEncoder().encode(source.xml), { type: 'areaChart' })) } });
  expect(updated.document.slides[0]!.objects.find(object => object.kind === 'chart')?.chart).toMatchObject({ status: 'supported', kind: 'area' });
});

test('native presentation charts render immediately and export with their edits', () => {
  const native = importNativePresentation(createPresentation());
  const slideId = native.document.slides[0]!.id;
  const inserted = applyPresentationCommand(native, { name: 'insert-chart', slideId, bounds: { x: 100, y: 80, width: 480, height: 320 }, content });
  expect(inserted.document.slides[0]!.objects.find(object => object.kind === 'chart')?.chart).toMatchObject({ kind: 'line' });
  expect(openPresentationArtifact(inserted.bytes()).document.slides[0]!.objects.find(object => object.kind === 'chart')?.chart).toMatchObject({ kind: 'line' });
});

test('portable chart edits retain one embedded workbook through repeated native exports', async () => {
  const { createChartWorkbook } = await import('../../sheets/src/index.ts');
  const { chartBytesToBase64, updateChartTitle } = await import('@tumblerjs/charts');
  const data = createChartWorkbook(new TextEncoder().encode(content.xml));
  let artifact = applyPresentationCommand(importNativePresentation(createPresentation()), { name: 'insert-chart', slideId: createPresentation().document.slides[0]!.id, bounds: { x: 10, y: 10, width: 480, height: 320 }, content: { xml: new TextDecoder().decode(data.source), workbook: chartBytesToBase64(data.artifact.bytes()) } });
  const slide = artifact.document.slides[0]!, chart = slide.objects.find(object => object.kind === 'chart')!;
  for (const title of ['First', 'Second', 'Third']) {
    artifact = applyPresentationCommand(artifact, { name: 'edit-chart', slideId: slide.id, objectKey: chart.key, content: { xml: new TextDecoder().decode(updateChartTitle(data.source, title)) } });
    expect(presentationChartContent(artifact.document, slide.id, chart.key).workbook).toBeDefined();
  }
  const exported = openPresentationArtifact(artifact.bytes());
  expect(exported.document.package.parts.filter(part => part.contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toHaveLength(1);
  expect(presentationChartContent(exported.document, exported.document.slides[0]!.id, exported.document.slides[0]!.objects.find(object => object.kind === 'chart')!.key).workbook).toBeDefined();
});
