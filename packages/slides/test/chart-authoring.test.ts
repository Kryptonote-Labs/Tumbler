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
