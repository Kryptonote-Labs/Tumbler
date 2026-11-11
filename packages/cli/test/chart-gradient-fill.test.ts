import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createOoxmlChart, type ChartSourceNode, type ChartResources } from '@tumblerjs/charts';
import { createWordArtifact } from '@tumblerjs/word';
import { createPresentation, applyPresentationCommand } from '@tumblerjs/slides';
import { createSpreadsheet, applySpreadsheetCommand } from '@tumblerjs/sheets';
import { createFileHost } from '../src/file-host.ts';
import { runTumbler } from '../src/index.ts';

test.each(['docx', 'pptx', 'xlsx'])('CLI solid and gradient edits preserve %s chart data and resources', async extension => {
  const directory = await mkdtemp(join(tmpdir(), 'tumbler-chart-gradient-'));
  try {
    const path = join(directory, `fill.${extension}`), content = { xml: new TextDecoder().decode(createOoxmlChart({ type: 'barChart', categories: ['A', 'B'], series: [{ name: 'Data', values: [2, 4] }] })) };
    const presentation = createPresentation();
    const bytes = extension === 'docx' ? createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: { width: 300, height: 200, content } }] }] }).bytes()
      : extension === 'pptx' ? applyPresentationCommand(presentation, { name: 'insert-chart', slideId: presentation.document.slides[0]!.id, bounds: { x: 10, y: 10, width: 400, height: 300 }, content }).bytes()
      : applySpreadsheetCommand(createSpreadsheet(), { name: 'insert-chart', sheetId: '1', x: 10, y: 10, width: 400, height: 300, content, bindUnboundData: true }).bytes();
    await Bun.write(path, bytes);
    const host = createFileHost(), list = await host.readCharts!(path, {}) as { parts: { part: string }[] }, part = list.parts[0]!.part;
    type Snapshot = { page: string; source: ChartSourceNode; resources: ChartResources; data: unknown };
    const before = await host.readCharts!(path, { part }) as Snapshot;
    let current = before, output = '', error = '';
    const edit = async (fill: unknown) => {
      output = ''; error = '';
      expect(await runTumbler([path, 'charts', 'edit', '--input', JSON.stringify({ page: current.page, part, fill })], { host, stdout: value => { output += value; }, stderr: value => { error += value; } })).toBe(0);
      expect(error).toBe(''); current = JSON.parse(output) as Snapshot;
    };
    await edit({ kind: 'solid', node: current.source.id, color: { kind: 'scheme', value: 'accent4' }, opacity: .4 });
    const solid = current.source.children.find(node => node.name === 'c:spPr')!.children.find(node => node.name === 'a:solidFill')!;
    expect(solid.children[0]!.attributes).toContainEqual(expect.objectContaining({ name: 'val', value: 'accent4' }));
    await edit({ kind: 'gradient', node: current.source.id, edit: { kind: 'settings', type: 'linear', angle: 45 } });
    await edit({ kind: 'gradient', node: current.source.id, edit: { kind: 'add', position: .35, color: { kind: 'scheme', value: 'accent2' }, opacity: .6 } });
    const gradient = () => current.source.children.find(node => node.name === 'c:spPr')!.children.find(node => node.name === 'a:gradFill')!;
    const added = gradient().children.find(node => node.name === 'a:gsLst')!.children.at(-1)!;
    await edit({ kind: 'gradient', node: current.source.id, edit: { kind: 'stop', node: added.id, position: .75, opacity: .2 } });
    const stops = gradient().children.find(node => node.name === 'a:gsLst')!.children;
    expect(stops).toHaveLength(3);
    expect(stops.at(-1)!.attributes).toContainEqual(expect.objectContaining({ name: 'pos', value: '75000' }));
    expect(stops.at(-1)!.children[0]!.children.at(-1)!.attributes).toContainEqual(expect.objectContaining({ name: 'val', value: '20000' }));
    expect(current.resources).toEqual(before.resources);
    expect(current.data).toEqual(before.data);
    const stale = current.page;
    await edit({ kind: 'gradient', node: current.source.id, edit: { kind: 'remove', node: stops.at(-1)!.id } });
    await expect(host.editChart!(path, { page: stale, part, fill: { kind: 'none', node: current.source.id } })).rejects.toThrow('changed');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
