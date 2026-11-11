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

test('imported and native chart rendering uses the slide template colours and fonts', async () => {
  const { presentationThemeColours } = await import('../src/index.ts');
  const { resolveChartColor } = await import('@tumblerjs/charts');
  for (const initial of [createPresentation(), importNativePresentation(createPresentation())]) {
    const slideId = initial.document.slides[0]!.id;
    const inserted = applyPresentationCommand(initial, { name: 'insert-chart', slideId, bounds: { x: 10, y: 10, width: 480, height: 320 }, content });
    for (const artifact of [inserted, openPresentationArtifact(inserted.bytes())]) {
      const model = artifact.document.slides[0]!.objects.find(object => object.kind === 'chart')!.chart!;
      if (model.status !== 'supported') throw new Error(model.reason);
      const theme = presentationThemeColours(artifact.document, artifact.document.slides[0]!.id);
      expect(resolveChartColor(model.series[0]!.fill!, model)).toBe(`#${theme.color('accent1')}`);
      expect(model.themeFonts?.['+mn-lt']).toBeTruthy();
    }
  }
});

test('compiled imported charts expose their data without export-only preservation', async () => {
  const { createPresentationNativeArchive, createPresentationNativeView, openPresentationNativeArchive } = await import('../src/index.ts');
  const empty = createPresentation(), slideId = empty.document.slides[0]!.id;
  const inserted = applyPresentationCommand(empty, { name: 'insert-chart', slideId, bounds: { x: 10, y: 10, width: 480, height: 320 }, content });
  const archive = createPresentationNativeArchive(inserted);
  const partial = openPresentationNativeArchive({ ...createPresentationNativeView(openPresentationNativeArchive(archive)), preservation: new Uint8Array() });
  const chart = partial.document.slides[0]!.objects.find(object => object.kind === 'chart')!;
  expect(presentationChartContent(partial.document, slideId, chart.key)).toMatchObject({ xml: content.xml, resources: { parts: [], relationships: [] } });
});

test('older native chart snapshots gain portable resources before partial loading', async () => {
  const { restoreNativePresentation, createPresentationNativeArchive, createPresentationNativeView, openPresentationNativeArchive } = await import('../src/index.ts');
  const original = createPresentation(), native = importNativePresentation(original), slideId = native.document.slides[0]!.id;
  const inserted = importNativePresentation(applyPresentationCommand(native, { name: 'insert-chart', slideId, bounds: { x: 10, y: 10, width: 480, height: 320 }, content }));
  const snapshot = inserted.snapshot();
  const legacy = restoreNativePresentation({ ...snapshot, slides: snapshot.slides.map(s => ({ ...s, slide: { ...s.slide, objects: s.slide.objects.map(o => o.kind === 'chart' ? { ...o, chartContent: { xml: content.xml } } : o) } })) }, () => original);
  const restored = openPresentationNativeArchive(createPresentationNativeArchive(legacy));
  const partial = openPresentationNativeArchive({ ...createPresentationNativeView(restored), preservation: new Uint8Array() });
  const chart = partial.document.slides[0]!.objects.find(object => object.kind === 'chart')!;
  expect(presentationChartContent(partial.document, slideId, chart.key).resources).toEqual({ parts: [], relationships: [] });
  expect(partial.state.revisionKey).toBe(inserted.state.revisionKey);
  expect(openPresentationArtifact(restored.bytes()).document.slides[0]!.objects.some(o => o.kind === 'chart')).toBe(true);
});

test.each(['layout', 'master'] as const)('native chart content follows its %s owner', async owner => {
  const { beginPackageTransaction } = await import('@tumblerjs/opc');
  const base = createPresentation(), slideId = base.document.slides[0]!.id;
  const inserted = applyPresentationCommand(base, { name: 'insert-chart', slideId, bounds: { x: 10, y: 10, width: 400, height: 300 }, content });
  const pkg = inserted.document.package, part = pkg.getPart(inserted.document.slides[0]!.part)!;
  const relations = pkg.relationships(part.name), layoutRel = relations.items.find(r => r.type.endsWith('/slideLayout'))!, chartRel = relations.items.find(r => r.type.endsWith('/chart'))!;
  if (layoutRel.targetMode !== 'Internal' || chartRel.targetMode !== 'Internal') throw Error('Internal chart and layout expected.');
  let target = pkg.getPart(layoutRel.targetPartName)!;
  if (owner === 'master') {
    const relation = pkg.relationships(target.name).items.find(r => r.type.endsWith('/slideMaster'))!;
    if (relation.targetMode !== 'Internal') throw Error('Internal master expected.');
    target = pkg.getPart(relation.targetPartName)!;
  }
  const source = new TextDecoder().decode(pkg.readPart(part)), inherited = new TextDecoder().decode(pkg.readPart(target));
  const frame = source.match(/<p:graphicFrame[\s\S]*?<\/p:graphicFrame>/)![0];
  const edit = beginPackageTransaction(pkg);
  edit.replacePart(part.name, new TextEncoder().encode(source.replace(frame, '')));
  edit.replacePart(target.name, new TextEncoder().encode(inherited.replace('</p:spTree>', frame.replace(/<p:cNvPr id="\d+"/, '<p:cNvPr id="900"') + '</p:spTree>')));
  edit.removeRelationship(part.name, chartRel.id);
  edit.addRelationship(target.name, { id: chartRel.id, type: chartRel.type, target: chartRel.targetPartName });
  const native = importNativePresentation(openPresentationArtifact(edit.commit()));
  const chart = native.document.slides[0]!.objects.find(o => o.kind === 'chart')!;
  expect(chart.layer).toBe(owner);
  expect(presentationChartContent(native.document, slideId, chart.key).xml).toBe(content.xml);
});
