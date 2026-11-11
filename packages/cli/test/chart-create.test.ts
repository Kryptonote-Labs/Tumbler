import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWordArtifact } from '@tumblerjs/word';
import { createPresentation } from '@tumblerjs/slides';
import { createSpreadsheet, openSpreadsheetArtifact } from '@tumblerjs/sheets';
import { OOXML_CHART_TYPES, readChartData, readChartContent } from '@tumblerjs/charts';
import { openOpcPackage } from '@tumblerjs/opc';
import { createFileHost } from '../src/file-host.ts';
import { runTumbler } from '../src/index.ts';

for (const type of OOXML_CHART_TYPES) for (const family of ['word', 'presentation', 'spreadsheet'] as const) {
  test(`CLI creates editable ${type} in ${family}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tumbler-create-chart-'));
    try {
      const extension = family === 'word' ? 'docx' : family === 'presentation' ? 'pptx' : 'xlsx';
      const path = join(directory, `chart.${extension}`), host = createFileHost();
      const initial = family === 'word' ? createWordArtifact({ paragraphs: [{ runs: [{ text: 'Keep' }] }] }).bytes() : family === 'presentation' ? createPresentation().bytes() : createSpreadsheet().editCell('A1', 'Keep').bytes();
      await Bun.write(path, initial);
      const snapshot = (family === 'word' ? await host.read(path, { offset: 0, region: 'body' })
        : family === 'presentation' ? await host.readPresentation!(path) : await host.readSpreadsheet!(path, {})) as { page: string; slide?: { id: string } };
      const target = family === 'word' ? { family, start: 0 } : family === 'presentation' ? { family, slideId: snapshot.slide!.id } : { family, sheetId: '1' };
      const series = Array.from({ length: type === 'stockChart' ? 3 : 1 }, (_, index) => ({ name: `Series ${index + 1}`, values: [2, 4], xValues: [1, 2], bubbleSizes: [3, 6] }));
      let stdout = '', stderr = '';
      const status = await runTumbler([path, 'charts', 'create', '--input', JSON.stringify({ page: snapshot.page, target, chart: { type, categories: ['Jan', 'Feb'], series } })], { host, stdout: value => { stdout += value; }, stderr: value => { stderr += value; } });
      expect(stderr).toBe(''); expect(status).toBe(0); expect(JSON.parse(stdout).page).toBeTruthy();
      const bytes = await Bun.file(path).bytes(), pkg = openOpcPackage(bytes);
      const part = pkg.parts.find(part => part.contentType === 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml')!;
      const content = readChartContent(pkg, part.name);
      expect(readChartData(new TextEncoder().encode(content.xml))[0]?.type).toBe(type);
      if (family === 'spreadsheet') {
        expect(content.workbook).toBeUndefined();
        const saved = openSpreadsheetArtifact(bytes);
        expect(saved.worksheet.cell('A1')?.value).toMatchObject({ type: 'string', value: 'Keep' });
        expect(readChartData(new TextEncoder().encode(content.xml))[0]?.series[0]?.values?.formula).toBeDefined();
      } else expect(content.workbook).toBeDefined();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

test('chart creation validates input without accessing a document and exposes its schema in help', async () => {
  let output = '';
  const options = { host: createFileHost(), stdout: (text: string) => { output += text; }, stderr: (text: string) => { output += text; } };
  expect(await runTumbler(['missing.docx', 'charts', 'create', '--help'], options)).toBe(0);
  expect(output).toContain('bubbleChart'); expect(output).toContain('family');
  expect(await runTumbler(['missing.docx', 'charts', 'create', '--input', '{"page":"x","chart":{"type":"invalid"}}'], options)).toBe(1);
});

test('native creation reconciles chart source conformance with a transitional host', async () => {
  const { runChartCreation, chartCreateInput } = await import('../src/chart-create.ts');
  const { applySpreadsheetCommand } = await import('@tumblerjs/sheets');
  let artifact = createSpreadsheet();
  await runChartCreation('workbook', chartCreateInput.parse({ page: 'revision', target: { family: 'spreadsheet', sheetId: '1' }, chart: { type: 'lineChart', conformance: 'strict', categories: ['A'], series: [{ name: 'Data', values: [2] }] } }), {
    async operateSpreadsheet(_document, input) { artifact = applySpreadsheetCommand(artifact, input.command); },
  });
  expect(artifact.worksheet.drawing?.charts[0]?.model).toMatchObject({ status: 'supported', kind: 'line' });
});

for (const family of ['word', 'presentation', 'spreadsheet'] as const) test(`creation adopts an existing Strict ${family} profile`, async () => {
  const { buildWordDocumentFixture } = await import('../../word/test/document-fixture.ts');
  const { buildWorkbookFixture } = await import('../../sheets/test/workbook-fixture.ts');
  const { saveOpcPackage } = await import('@tumblerjs/opc');
  const { parseOoxmlChart } = await import('@tumblerjs/charts');
  const { OOXML_NAMESPACES } = await import('../../ooxml/src/index.ts');
  const directory = await mkdtemp(join(tmpdir(), 'tumbler-strict-create-chart-'));
  try {
    const packageSource = createPresentation().document.package;
    const changes = new Map<string, Uint8Array>();
    for (const part of packageSource.parts) if (/\.(xml|rels)$/.test(part.name.value)) {
      let value = new TextDecoder().decode(packageSource.readPart(part));
      for (const key of ['presentation', 'drawing'] as const) value = value.replaceAll(OOXML_NAMESPACES.transitional[key], OOXML_NAMESPACES.strict[key]);
      value = value.replaceAll('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships');
      changes.set(part.name.value, new TextEncoder().encode(value));
    }
    const bytes = family === 'word' ? buildWordDocumentFixture({ conformance: 'strict' }) : family === 'spreadsheet' ? buildWorkbookFixture({ conformance: 'strict' }) : saveOpcPackage(packageSource, changes);
    const path = join(directory, family === 'word' ? 'chart.docx' : family === 'presentation' ? 'chart.pptx' : 'chart.xlsx');
    await Bun.write(path, bytes);
    const host = createFileHost();
    const snapshot = (family === 'word' ? await host.read(path, { offset: 0, region: 'body' }) : family === 'presentation' ? await host.readPresentation!(path) : await host.readSpreadsheet!(path, {})) as { page: string; slide?: { id: string } };
    const target = family === 'word' ? { family, start: 0 } : family === 'presentation' ? { family, slideId: snapshot.slide!.id } : { family, sheetId: '1' };
    let stderr = '';
    const code = await runTumbler([path, 'charts', 'create', '--input', JSON.stringify({ page: snapshot.page, target, chart: { type: 'lineChart', categories: ['A'], series: [{ name: 'Data', values: [2] }] } })], { host, stdout() {}, stderr(value) { stderr += value; } });
    expect(stderr).toBe(''); expect(code).toBe(0);
    const pkg = openOpcPackage(await Bun.file(path).bytes()), chart = pkg.parts.find(part => part.contentType === 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml')!;
    expect(parseOoxmlChart(pkg.readPart(chart), 'strict')).toMatchObject({ status: 'supported', kind: 'line' });
    if (family !== 'spreadsheet') expect(readChartContent(pkg, chart.name).workbook).toBeDefined();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
