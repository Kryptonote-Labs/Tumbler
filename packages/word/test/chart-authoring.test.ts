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

test('editing a transparent theme-coloured chart title keeps its colour source and opacity', async () => {
  const { updateChartTitle, resolveChartColor } = await import('@tumblerjs/charts');
  const { wordChartTitleText } = await import('../src/index.ts');
  const { WordShapeText } = await import('../src/collaboration/index.ts');
  const authored = chart();
  const title = new TextDecoder().decode(updateChartTitle(new TextEncoder().encode(authored.content.xml), 'Alpha')).replace('<a:r>', '<a:r><a:rPr><a:solidFill><a:schemeClr val="accent1"><a:alpha val="50000"/></a:schemeClr></a:solidFill></a:rPr>');
  const run = { text: '\uFFFC', chart: { ...authored, content: { ...authored.content, xml: title } } };
  const native = new NativeWordDocument({ content: [{ kind: 'paragraph', runs: [run] }] });
  const drawing = [...native.drawings.values()][0]!;
  if (drawing.kind !== 'chart') throw new Error('Missing chart');
  const editor = new WordShapeText({ textBody: wordChartTitleText(drawing.model) });
  editor.replace({ start: 0, end: 5 }, 'Revised');
  native.update([{ kind: 'paragraph', runs: [{ ...run, chartTitleText: editor.paragraphs() }] }]);
  const saved = native.artifact();
  const result = [...saved.document.drawings.values()][0]!;
  if (result.kind !== 'chart') throw new Error('Missing saved chart');
  expect(result.model.title).toBe('Revised');
  const source = new TextDecoder().decode(saved.document.package.readPart(saved.document.package.getPart(result.partName)!));
  expect(source).toContain('alpha');
  expect(source).toContain('schemeClr');
  expect(resolveChartColor(result.model.titleText![0]!.runs[0]!.style!.color!, result.model)).toBe('rgba(21,96,130,0.5)');
});

test('merged editor runs keep distinct chart opacity on unchanged text', async () => {
  const { updateChartTitle, resolveChartColor } = await import('@tumblerjs/charts');
  const { wordChartTitleText } = await import('../src/index.ts');
  const { WordShapeText } = await import('../src/collaboration/index.ts');
  const authored = chart();
  let title = new TextDecoder().decode(updateChartTitle(new TextEncoder().encode(authored.content.xml), 'One'));
  title = title.replace('<a:r>', '<a:r><a:rPr><a:solidFill><a:schemeClr val="accent1"><a:alpha val="25000"/></a:schemeClr></a:solidFill></a:rPr>').replace('</a:r>', '</a:r><a:r><a:rPr><a:solidFill><a:schemeClr val="accent1"><a:alpha val="75000"/></a:schemeClr></a:solidFill></a:rPr><a:t>Two</a:t></a:r>');
  const run = { text: '\uFFFC', chart: { ...authored, content: { ...authored.content, xml: title } } };
  const native = new NativeWordDocument({ content: [{ kind: 'paragraph', runs: [run] }] });
  const drawing = [...native.drawings.values()][0]!;
  if (drawing.kind !== 'chart') throw new Error('Missing chart');
  const editor = new WordShapeText({ textBody: wordChartTitleText(drawing.model) });
  expect(editor.paragraphs()[0]?.runs).toHaveLength(1);
  editor.replace({ start: 1, end: 2 }, 'X');
  native.update([{ kind: 'paragraph', runs: [{ ...run, chartTitleText: editor.paragraphs() }] }]);
  const saved = native.artifact();
  const result = [...saved.document.drawings.values()][0]!;
  if (result.kind !== 'chart') throw new Error('Missing chart');
  expect(result.model.title).toBe('OXeTwo');
  const runs = result.model.titleText![0]!.runs;
  expect(runs.map(run => [run.text, resolveChartColor(run.style!.color!, result.model)])).toEqual([['OXe', 'rgba(21,96,130,0.25)'], ['Two', 'rgba(21,96,130,0.75)']]);
});


test('an imported inline title remains current when the property editor changes its type', () => {
  const authored = chart();
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: authored }] }] });
  const imported = importWordContent(source);
  const document = new NativeWordDocument({ source });
  document.update(imported.map(block => block.kind !== 'paragraph' ? block : { ...block, runs: block.runs.map(run => run.text === '\uFFFC' ? { ...run, chartTitle: 'Current title' } : run) }));
  const drawing = [...document.drawings.values()][0]!;
  if (drawing.kind !== 'chart' || !drawing.content) throw new Error('Missing editable chart source');
  expect(drawing.content.xml).toContain('Current title');
  expect(drawing.content.workbook).toBeUndefined();
  const content = { ...drawing.content, xml: new TextDecoder().decode(convertChartType(new TextEncoder().encode(drawing.content.xml), { type: 'lineChart' })) };
  document.update(imported.map(block => block.kind !== 'paragraph' ? block : { ...block, runs: block.runs.map(run => run.text === '\uFFFC' ? { ...run, chartContent: content } : run) }));
  const saved = openWordArtifact(document.artifact().bytes());
  const changed = [...saved.document.drawings.values()][0]!;
  expect(changed).toMatchObject({ kind: 'chart', model: { title: 'Current title', kind: 'line' } });
  if (changed.kind !== 'chart') return;
  expect(readChartContent(saved.document.package, changed.partName).workbook).toBe(authored.content.workbook);
});
