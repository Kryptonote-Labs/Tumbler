import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beginPackageTransaction, openOpcPackage } from '@tumblerjs/opc';
import { createWordArtifact } from '@tumblerjs/word';
import { createSpreadsheet } from '@tumblerjs/sheets';
import { createOoxmlChart, type ChartSourceNode } from '@tumblerjs/charts';
import { createFileHost } from '../src/file-host.ts';
import { runTumbler } from '../src/index.ts';

for (const extension of ['docx', 'xlsx', 'pptx']) {
  test(`chart CLI preserves unrelated ${extension} parts and rejects stale edits`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tumbler-chart-cli-'));
    try {
      const path = join(directory, `chart.${extension}`);
      const original = extension === 'docx' ? createWordArtifact({ paragraphs: [{ runs: [{ text: 'Keep this' }] }] }).bytes()
        : extension === 'xlsx' ? createSpreadsheet().bytes()
        : await Bun.file(new URL('../../../apps/docs/static/samples/workspace-brief.pptx', import.meta.url)).bytes();
      const pkg = openOpcPackage(original);
      const part = '/charts/authoring.xml';
      const bytes = beginPackageTransaction(pkg).addPart(part, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml', createOoxmlChart({ type: 'pieChart', categories: ['A'], series: [{ name: 'Revenue', values: [12] }] })).commit();
      await Bun.write(path, bytes);
      const host = createFileHost();
      let stdout = '', stderr = '';
      const run = (args: string[]) => {
        stdout = ''; stderr = '';
        return runTumbler([path, 'charts', ...args], { host, stdout: text => { stdout += text; }, stderr: text => { stderr += text; } });
      };
      expect(await run(['read', '--part', part])).toBe(0);
      const snapshot = JSON.parse(stdout) as { page: string; source: ChartSourceNode };
      const chart = snapshot.source.children.find(child => child.name === 'c:chart')!;
      const titleFlag = chart.children.find(child => child.name === 'c:autoTitleDeleted')!;
      const edit = { page: snapshot.page, part, edits: [{ kind: 'attribute', node: titleFlag.id, name: 'val', value: '0' }] };
      expect(await run(['edit', '--input', JSON.stringify(edit)])).toBe(0);
      expect(JSON.parse(stdout).source.children[0].children.find((child: ChartSourceNode) => child.name === 'c:autoTitleDeleted').attributes).toContainEqual(expect.objectContaining({ name: 'val', value: '0' }));
      const updated = await Bun.file(path).bytes();
      const output = openOpcPackage(updated);
      for (const source of pkg.parts) expect(output.readPart(output.getPart(source.name)!)).toEqual(pkg.readPart(source));
      expect(await run(['edit', '--input', JSON.stringify(edit)])).toBe(1);
      expect(stderr).toContain('changed');
      expect(await Bun.file(path).bytes()).toEqual(updated);
      expect(await run(['read', '--part', pkg.parts[0]!.name.value])).toBe(1);
      expect(stderr).toContain('missing');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

test('chart help and malformed edit inputs do not open documents', async () => {
  let output = '';
  const options = { host: createFileHost(), stdout: (text: string) => { output += text; }, stderr: (text: string) => { output += text; } };
  expect(await runTumbler(['missing.docx', 'charts', '--help'], options)).toBe(0);
  expect(output).toContain('snapshot node IDs');
  expect(await runTumbler(['missing.docx', 'charts', 'edit', '--input', '{"page":"x","part":"x","edits":[]}'], options)).toBe(1);
});

test('chart CLI converts a Word chart and edits its embedded cells without duplicating workbooks', async () => {
  const { createChartWorkbook } = await import('@tumblerjs/sheets');
  const { chartBytesToBase64, readChartData } = await import('@tumblerjs/charts');
  const directory = await mkdtemp(join(tmpdir(), 'tumbler-chart-data-cli-'));
  try {
    const path = join(directory, 'chart.docx');
    const created = createChartWorkbook(createOoxmlChart({ type: 'barChart', categories: ['A', 'B'], series: [{ name: 'Sales', values: [2, 4] }] }));
    await Bun.write(path, createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: { width: 360, height: 240, content: { xml: new TextDecoder().decode(created.source), workbook: chartBytesToBase64(created.artifact.bytes()) } } }] }] }).bytes());
    const host = createFileHost();
    let stdout = '', stderr = '';
    const run = (args: string[]) => { stdout = ''; stderr = ''; return runTumbler([path, 'charts', ...args], { host, stdout: value => { stdout += value; }, stderr: value => { stderr += value; } }); };
    expect(await run(['read'])).toBe(0);
    const part = (JSON.parse(stdout) as { parts: { part: string }[] }).parts[0]!.part;
    expect(await run(['read', '--part', part])).toBe(0);
    const page = (JSON.parse(stdout) as { page: string }).page;
    expect(await run(['convert', '--input', JSON.stringify({ page, part, type: 'areaChart' })])).toBe(0);
    const next = (JSON.parse(stdout) as { page: string }).page;
    expect(await run(['data', '--input', JSON.stringify({ page: next, part, cells: [{ reference: 'B2', formula: '3*5' }] })])).toBe(0);
    const output = openOpcPackage(await Bun.file(path).bytes());
    expect(readChartData(output.readPart(output.getPart(part)!))[0]?.series[0]?.values?.values).toEqual([15, 4]);
    expect(output.parts.filter(part => part.contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toHaveLength(1);
    expect(stderr).toBe('');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('chartEx source editing remains available without classic chart conversion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tumbler-chartex-cli-'));
  try {
    const path = join(directory, 'chart.pptx');
    const pkg = openOpcPackage(await Bun.file(new URL('../../../apps/docs/static/samples/workspace-brief.pptx', import.meta.url)).bytes());
    const part = '/ppt/charts/extended.xml';
    await Bun.write(path, beginPackageTransaction(pkg).addPart(part, 'application/vnd.ms-office.chartex+xml', new TextEncoder().encode('<cx:chartSpace xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex"><cx:chart/></cx:chartSpace>')).commit());
    const host = createFileHost();
    const snapshot = await host.readCharts!(path, { part }) as { page: string; source: ChartSourceNode };
    await host.editChart!(path, { page: snapshot.page, part, edits: [{ kind: 'attribute', node: snapshot.source.id, name: 'custom', value: 'retained' }] });
    const result = await host.readCharts!(path, { part }) as { source: ChartSourceNode };
    expect(result.source.attributes).toContainEqual(expect.objectContaining({ name: 'custom', value: 'retained' }));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('XLSX chart reads report live worksheet values while property IDs address the saved source', async () => {
  const { createChartWorkbook, applySpreadsheetCommand } = await import('@tumblerjs/sheets');
  const directory = await mkdtemp(join(tmpdir(), 'tumbler-live-chart-cli-'));
  try {
    const created = createChartWorkbook(createOoxmlChart({ type: 'barChart', categories: ['A', 'B'], series: [{ name: 'One', values: [2, 4] }] }));
    let artifact = applySpreadsheetCommand(created.artifact, { name: 'insert-chart', sheetId: '1', x: 10, y: 10, width: 480, height: 320, content: { xml: new TextDecoder().decode(created.source) } });
    artifact = applySpreadsheetCommand(artifact, { name: 'set-formula', sheetId: '1', reference: 'B2', formula: '6*7' });
    const path = join(directory, 'live.xlsx');
    await Bun.write(path, artifact.bytes());
    const host = createFileHost();
    const list = await host.readCharts!(path, {}) as { parts: { part: string }[] };
    const part = list.parts[0]!.part;
    const before = await Bun.file(path).bytes();
    const snapshot = await host.readCharts!(path, { part }) as { page: string; source: ChartSourceNode; data: { series: { values: { values: number[] } }[] }[] };
    expect(snapshot.data[0]?.series[0]?.values.values).toEqual([42, 4]);
    expect(await Bun.file(path).bytes()).toEqual(before);
    const chart = snapshot.source.children.find(child => child.name === 'c:chart')!;
    const titleFlag = chart.children.find(child => child.name === 'c:autoTitleDeleted')!;
    const changed = await host.editChart!(path, { page: snapshot.page, part, edits: [{ kind: 'attribute', node: titleFlag.id, name: 'val', value: '0' }] }) as { data: typeof snapshot.data };
    expect(changed.data[0]?.series[0]?.values.values).toEqual([42, 4]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
