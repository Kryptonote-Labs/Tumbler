import { expect, test } from 'bun:test';
import { createCanvas } from '@napi-rs/canvas';
import { beginPackageTransaction, openOpcPackage, writeZipArchiveChanges } from '@tumblerjs/opc';
import { createWordArtifact, importWordContent, NativeWordDocument } from '../../word/src/index.ts';
import { createPresentation, applyPresentationCommand, importNativePresentation, presentationChartContent } from '../../slides/src/index.ts';
import { createSpreadsheet, applySpreadsheetCommand, createChartWorkbook } from '../../sheets/src/index.ts';
import { addChartContent, chartBytesToBase64, createOoxmlChart, isChartResources, mergeChartContent, readChartContent, writeChartContent, type ChartContent, type ChartResources } from '../src/index.ts';

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const chartType = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';
const image = createCanvas(2, 2); image.getContext('2d').fillRect(0, 0, 2, 2);
const data = chartBytesToBase64(image.toBuffer('image/png'));
const xml = new TextDecoder().decode(createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'Data', values: [2] }] }));
const resources: ChartResources = { parts: [{ key: 'picture', contentType: 'image/png', data }], relationships: [{ id: 'picture', type: R + 'image', target: 'picture' }] };

function chartPart(pkg: ReturnType<typeof openOpcPackage>) { return pkg.parts.find(part => part.contentType === chartType)!; }
for (const family of ['word', 'slides', 'sheets'] as const) test(`${family} inserts and reopens a native chart with portable resources`, () => {
  const content = { xml, resources };
  const word = () => createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: { width: 360, height: 240, content } }] }] }).bytes();
  const slides = () => { const presentation = createPresentation(); return applyPresentationCommand(presentation, { name: 'insert-chart', slideId: presentation.document.slides[0]!.id, bounds: { x: 10, y: 10, width: 480, height: 320 }, content }).bytes(); };
  const sheets = () => applySpreadsheetCommand(createSpreadsheet(), { name: 'insert-chart', sheetId: '1', x: 10, y: 10, width: 480, height: 320, content }).bytes();
  const pkg = openOpcPackage(family === 'word' ? word() : family === 'slides' ? slides() : sheets());
  const part = chartPart(pkg), read = readChartContent(pkg, part.name);
  const relationship = pkg.relationships(part.name).get('picture');
  expect(relationship?.targetMode).toBe('Internal');
  expect(read.resources?.parts[0]).toMatchObject({ contentType: 'image/png', data });
  expect(read.resources?.relationships[0]?.target).toBe(read.resources?.parts[0]?.key);
});

test('resource graphs preserve shared targets, external links, fragments and cycles', () => {
  const pkg = openOpcPackage(createSpreadsheet().bytes());
  const transaction = beginPackageTransaction(pkg);
  const graph: ChartResources = { parts: [
    { key: 'one', contentType: 'application/xml', data: chartBytesToBase64(new TextEncoder().encode('<test/>')), relationships: [{ id: 'back', type: 'urn:test:cycle', target: '$chart' }, { id: 'shared', type: 'urn:test:shared', target: 'two', fragment: 'item 1' }] },
    { key: 'two', contentType: 'application/octet-stream', data: 'AQID' },
  ], relationships: [{ id: 'one', type: 'urn:test:one', target: 'one' }, { id: 'two', type: 'urn:test:two', target: 'two' }, { id: 'web', type: R + 'hyperlink', target: 'https://example.com/chart', targetMode: 'External' }] };
  addChartContent(transaction, '/xl/charts/one.xml', { xml, resources: graph });
  const saved = openOpcPackage(transaction.commit()), read = readChartContent(saved, '/xl/charts/one.xml').resources!;
  expect(read.parts).toHaveLength(2);
  expect(read.relationships).toContainEqual(expect.objectContaining({ id: 'web', targetMode: 'External', target: 'https://example.com/chart' }));
  expect(read.parts[0]?.relationships).toContainEqual(expect.objectContaining({ id: 'back', target: '$chart' }));
  expect(read.parts[0]?.relationships).toContainEqual(expect.objectContaining({ id: 'shared', target: read.parts[1]?.key, fragment: 'item 1' }));
});

test('source-only edits reuse resources and preserve the source workbook', () => {
  const workbook = createChartWorkbook(new TextEncoder().encode(xml));
  const original = openOpcPackage(createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: { width: 360, height: 240, content: { xml: new TextDecoder().decode(workbook.source), workbook: chartBytesToBase64(workbook.artifact.bytes()), resources } } }] }] }).bytes());
  const part = chartPart(original), content = readChartContent(original, part.name);
  const transaction = beginPackageTransaction(original);
  writeChartContent(transaction, part.name, { ...content, xml: content.xml.replace('autoTitleDeleted val="1"', 'autoTitleDeleted val="0"') });
  const saved = openOpcPackage(transaction.commit());
  expect(saved.parts).toHaveLength(original.parts.length);
  expect(readChartContent(saved, part.name).resources).toEqual(content.resources);
  expect(readChartContent(saved, part.name).workbook).toBe(content.workbook);
  expect(mergeChartContent(content, { xml }).resources).toBe(content.resources);
});

test('resource edits isolate assets shared by another chart', () => {
  const transaction = beginPackageTransaction(openOpcPackage(createSpreadsheet().bytes()));
  addChartContent(transaction, '/xl/charts/one.xml', { xml, resources });
  addChartContent(transaction, '/xl/charts/two.xml', { xml });
  const first = openOpcPackage(transaction.commit()), imagePart = first.parts.find(part => part.contentType === 'image/png')!;
  const sharing = beginPackageTransaction(first).addRelationship('/xl/charts/two.xml', { id: 'picture', type: R + 'image', target: imagePart.name });
  const shared = openOpcPackage(sharing.commit()), content = readChartContent(shared, '/xl/charts/one.xml');
  const change = beginPackageTransaction(shared);
  writeChartContent(change, '/xl/charts/one.xml', { ...content, resources: { ...content.resources!, parts: content.resources!.parts.map(part => ({ ...part, data: 'AQID' })) } });
  const saved = openOpcPackage(change.commit());
  expect(readChartContent(saved, '/xl/charts/one.xml').resources?.parts[0]?.data).toBe('AQID');
  expect(readChartContent(saved, '/xl/charts/two.xml').resources?.parts[0]?.data).toBe(data);
});

test('resource conformance follows the host while embedded packages remain opaque', () => {
  const original = openOpcPackage(createSpreadsheet().bytes()), root = original.archive.get('_rels/.rels')!;
  const strict = writeZipArchiveChanges(original.archive, { replacements: new Map([['_rels/.rels', new TextEncoder().encode(new TextDecoder().decode(original.archive.read(root)).replaceAll(R, 'http://purl.oclc.org/ooxml/officeDocument/relationships/'))]]) });
  const pkg = openOpcPackage(strict), transaction = beginPackageTransaction(pkg);
  const markup = `<a:shape xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>`;
  addChartContent(transaction, '/xl/charts/strict.xml', { xml, resources: { parts: [{ key: 'drawing', contentType: 'application/xml', data: chartBytesToBase64(new TextEncoder().encode(markup)) }], relationships: [{ id: 'drawing', type: R + 'chartUserShapes', target: 'drawing' }] } });
  const saved = openOpcPackage(transaction.commit()), read = readChartContent(saved, '/xl/charts/strict.xml');
  expect(read.xml).toContain('http://purl.oclc.org/ooxml/drawingml/chart');
  expect(read.resources?.relationships[0]?.type).toBe('http://purl.oclc.org/ooxml/officeDocument/relationships/chartUserShapes');
  expect(atob(read.resources!.parts[0]!.data)).toContain('http://purl.oclc.org/ooxml/drawingml/main');
});

test('resource validation rejects invalid graphs before host commands accept them', () => {
  expect(isChartResources(resources)).toBe(true);
  for (const value of [null, {}, { parts: [], relationships: resources.relationships }, { ...resources, parts: [...resources.parts, ...resources.parts] }, { ...resources, parts: [{ ...resources.parts[0], data: '?' }] }]) expect(isChartResources(value)).toBe(false);
  const transaction = beginPackageTransaction(openOpcPackage(createSpreadsheet().bytes()));
  const workbook = createChartWorkbook(new TextEncoder().encode(xml));
  const content: ChartContent = { xml: new TextDecoder().decode(workbook.source), workbook: chartBytesToBase64(workbook.artifact.bytes()), resources: { parts: [], relationships: [] } };
  addChartContent(transaction, '/xl/charts/one.xml', content);
  expect(readChartContent(openOpcPackage(transaction.commit()), '/xl/charts/one.xml').workbook).toBe(content.workbook);
});

test('linked external source URLs remain portable and local data can replace them without ID collisions', () => {
  const linked = xml.replace('</c:chartSpace>', `<c:externalData xmlns:r="${R.slice(0, -1)}" r:id="external"/></c:chartSpace>`);
  const linkedResources: ChartResources = { ...resources, relationships: [...resources.relationships, { id: 'external', type: R + 'package', target: 'https://example.com/data.xlsx', targetMode: 'External' }] };
  const transaction = beginPackageTransaction(openOpcPackage(createSpreadsheet().bytes()));
  addChartContent(transaction, '/xl/charts/linked.xml', { xml: linked, resources: linkedResources });
  const original = openOpcPackage(transaction.commit()), read = readChartContent(original, '/xl/charts/linked.xml');
  expect(read.resources?.relationships).toContainEqual(expect.objectContaining({ id: 'external', targetMode: 'External' }));
  const workbook = createChartWorkbook(new TextEncoder().encode(read.xml));
  const edit = beginPackageTransaction(original);
  writeChartContent(edit, '/xl/charts/linked.xml', { ...read, xml: new TextDecoder().decode(workbook.source), workbook: chartBytesToBase64(workbook.artifact.bytes()) });
  const saved = readChartContent(openOpcPackage(edit.commit()), '/xl/charts/linked.xml');
  expect(saved.workbook).toBeDefined();
  expect(saved.resources?.parts[0]?.data).toBe(data);
});

test('native chart projections retain omitted resources independently of an explicit workbook update', () => {
  const workbook = createChartWorkbook(new TextEncoder().encode(xml));
  const content = { xml: new TextDecoder().decode(workbook.source), workbook: chartBytesToBase64(workbook.artifact.bytes()), resources };
  const { resources: omitted, ...update } = content;
  const word = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: { width: 360, height: 240, content } }] }] });
  const nativeWord = new NativeWordDocument({ source: word });
  nativeWord.update(importWordContent(word).map(block => block.kind !== 'paragraph' ? block : { ...block, runs: block.runs.map(run => run.text === '\uFFFC' ? { ...run, chartContent: update } : run) }));
  const drawing = [...nativeWord.drawings.values()].find(drawing => drawing.kind === 'chart');
  expect(drawing?.kind === 'chart' && drawing.content?.resources?.parts[0]?.data).toBe(data);
  const empty = createPresentation(), slideId = empty.document.slides[0]!.id;
  const inserted = applyPresentationCommand(empty, { name: 'insert-chart', slideId, bounds: { x: 0, y: 0, width: 480, height: 320 }, content });
  const native = importNativePresentation(inserted), objectKey = native.document.slides[0]!.objects.find(object => object.kind === 'chart')!.key;
  const updated = applyPresentationCommand(native, { name: 'edit-chart', slideId, objectKey, content: update });
  const portable = presentationChartContent(updated.document, slideId, objectKey);
  expect(portable.resources?.parts[0]?.data).toBe(data);
  expect(portable.workbook).toBe(content.workbook);
});
