import { expect, test } from 'bun:test';
import { createWordArtifact, importWordContent, NativeWordDocument, openWordArtifact } from '../src/index.ts';
import { createOoxmlChart, convertChartType, readChartContent, chartBytesToBase64, readChartData } from '@tumblerjs/charts';
import { createChartWorkbook, refreshChartWorkbook } from '../../sheets/src/index.ts';

function chart() {
  const workbook = createChartWorkbook(createOoxmlChart({ type: 'barChart', categories: ['Jan', 'Feb'], series: [{ name: 'Revenue', values: [4, 8] }] }));
  return { width: 360, height: 240, content: { xml: new TextDecoder().decode(workbook.source), workbook: chartBytesToBase64(workbook.artifact.bytes()) } };
}

test('authored Word charts retain an editable embedded workbook after save and reopen', () => {
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: chart() }] }] });
  const drawing = [...source.document.drawings.values()][0]!;
  expect(drawing.kind).toBe('chart');
  if (drawing.kind !== 'chart') return;
  expect(drawing.model).toMatchObject({ status: 'supported', kind: 'column' });
  expect(readChartContent(source.document.package, drawing.partName).workbook).toBeDefined();
  expect(readChartData(source.document.package.readPart(source.document.package.getPart(drawing.partName)!))[0]?.series[0]?.values?.values).toEqual([4, 8]);
});

test('imported chart edits update native rendering and the saved chart without losing source data', () => {
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: chart() }, { text: ' after' }] }] });
  const drawing = [...source.document.drawings.values()][0]!;
  if (drawing.kind !== 'chart') throw new Error('Missing chart');
  const content = readChartContent(source.document.package, drawing.partName);
  const converted = { ...content, xml: new TextDecoder().decode(convertChartType(new TextEncoder().encode(content.xml), { type: 'lineChart' })) };
  const model = new NativeWordDocument({ source });
  model.update(importWordContent(source).map(block => block.kind !== 'paragraph' ? block : { ...block, runs: block.runs.map(run => run.source === drawing.elementId || run.text === '\uFFFC' ? { ...run, chartContent: converted } : run) }));
  expect([...model.drawings.values()][0]).toMatchObject({ kind: 'chart', model: { kind: 'line' } });
  const saved = openWordArtifact(model.artifact().bytes());
  const updated = [...saved.document.drawings.values()][0]!;
  expect(updated).toMatchObject({ kind: 'chart', model: { kind: 'line' } });
  if (updated.kind !== 'chart') return;
  expect(readChartContent(saved.document.package, updated.partName).workbook).toBeDefined();
});

test('new chart attributes render and save through the native document engine', () => {
  const model = new NativeWordDocument({ content: [{ kind: 'paragraph', runs: [{ text: '\uFFFC', chart: chart() }] }] });
  expect([...model.drawings.values()][0]).toMatchObject({ kind: 'chart', model: { kind: 'column' } });
  expect([...model.artifact().document.drawings.values()][0]).toMatchObject({ kind: 'chart', model: { kind: 'column' } });
});

test('chart insertion into an existing document copies the complete workbook relationship graph', () => {
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Before' }] }] });
  const model = new NativeWordDocument({ source });
  model.update([...importWordContent(source), { kind: 'paragraph', runs: [{ text: '\uFFFC', chart: chart() }] }]);
  const saved = model.artifact();
  const drawing = [...saved.document.drawings.values()].find(drawing => drawing.kind === 'chart');
  expect(drawing).toBeDefined();
  if (drawing?.kind !== 'chart') return;
  expect(readChartContent(saved.document.package, drawing.partName).workbook).toBeDefined();
});

test('new and imported charts compose inline titles with type/data edits before export', () => {
  const authored = chart();
  const native = new NativeWordDocument({ content: [{ kind: 'paragraph', runs: [{ text: '\uFFFC', chart: authored, chartTitle: 'Authored title' }] }] });
  expect([...native.drawings.values()][0]).toMatchObject({ kind: 'chart', model: { title: 'Authored title' } });
  expect([...native.artifact().document.drawings.values()][0]).toMatchObject({ kind: 'chart', model: { title: 'Authored title' } });
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: authored }] }] });
  const document = new NativeWordDocument({ source });
  const changed = { ...authored.content, xml: new TextDecoder().decode(convertChartType(new TextEncoder().encode(authored.content.xml), { type: 'areaChart' })) };
  document.update(importWordContent(source).map(block => block.kind !== 'paragraph' ? block : { ...block, runs: block.runs.map(run => run.text === '\uFFFC' ? { ...run, chartContent: changed, chartTitle: 'Updated title' } : run) }));
  expect([...document.drawings.values()][0]).toMatchObject({ kind: 'chart', model: { kind: 'area', title: 'Updated title' } });
  expect([...document.artifact().document.drawings.values()][0]).toMatchObject({ kind: 'chart', model: { kind: 'area', title: 'Updated title' } });
});

test('chart authoring rejects a base64 payload that is not a workbook package', () => {
  expect(() => createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: { ...chart(), content: { ...chart().content, workbook: 'YQ==' } } }] }] })).toThrow();
});
