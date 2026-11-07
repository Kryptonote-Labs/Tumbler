import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { runTumbler } from '../src/index.ts';
import { createFileHost } from '../src/file-host.ts';

test('spreadsheet CLI authors rich formatting and returns its selection state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tumbler-formatting-cli-'));
  const path = join(directory, 'formats.xlsx');
  const host = createFileHost();
  let output = '';
  const run = async (args: string[]) => {
    output = '';
    return runTumbler(args, { host, stdout: text => { output += text; }, stderr: text => { throw new Error(text); } });
  };
  try {
    expect(await run(['create', path])).toBe(0);
    expect(await run([path, 'sheets', 'read'])).toBe(0);
    const receipt = z.object({ page: z.string() }).parse(JSON.parse(output));
    expect(await run([path, 'sheets', 'batch', '--page', receipt.page, '--input', JSON.stringify({ commands: [
      { name: 'format-cells', sheetId: '1', range: 'A1:B2', patch: { text: { fontFamily: { set: 'Georgia' } }, cell: { fill: { set: { type: 'solid', color: { type: 'theme', slot: 'accent3' } } }, wrapText: { set: true } } } },
      { name: 'set-borders', sheetId: '1', range: 'A1:B2', preset: 'outside', style: 'double' },
      { name: 'set-number-format', sheetId: '1', range: 'A1:B2', format: 'percent' },
      { name: 'adjust-number-decimals', sheetId: '1', range: 'A1:B2', direction: 'increase' },
    ] })])).toBe(0);
    expect(await run([path, 'sheets', 'read', '--range', 'A1:B2'])).toBe(0);
    const result: unknown = JSON.parse(output);
    expect(result).toMatchObject({
      formatting: { text: { fontFamily: { state: 'value', value: 'Georgia' } }, cell: { fill: { state: 'value', value: { type: 'solid', color: { type: 'theme', slot: 'accent3' } } }, wrapText: { value: true } } },
      numberFormat: { state: 'value', value: { category: 'percent', decimals: 3 } },
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
