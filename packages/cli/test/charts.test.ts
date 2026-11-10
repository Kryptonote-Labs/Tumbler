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
