import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTumbler } from '../src/index.ts';
import { createFileHost } from '../src/file-host.ts';
import { mergeFixture } from '../../pdf/test/merge-fixtures.ts';
import { mergePdfPages, openPdfDocument } from '@tumblerjs/pdf';

async function run(args: string[], host = createFileHost()) {
  let stdout = '', stderr = '';
  const code = await runTumbler(args, { host, stdout: (s) => { stdout += s; }, stderr: (s) => { stderr += s; } });
  return { code, stdout, stderr };
}
test('CLI merges with the same API, preserves sources and supports interleaving and repeated pages', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pdf-merge-'));
  try {
    const first = join(dir, 'first.pdf'), second = join(dir, 'second.pdf'), output = join(dir, 'merged.pdf');
    const a = mergeFixture('Alpha'), b = mergeFixture('Beta', 1);
    writeFileSync(first, a); writeFileSync(second, b);
    const result = await run([first, 'pdf', 'merge', '--pages=2-1', '--source', second, '--source', first, '--pages', '2,2', '--output', output]);
    expect(result.stderr).toBe(''); expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ output, pageCount: 6 });
    expect(readFileSync(output)).toEqual(Buffer.from(mergePdfPages([{ document: openPdfDocument(a), pages: [1, 0] }, { document: openPdfDocument(b) }, { document: openPdfDocument(a), pages: [1, 1] }])));
    expect(readFileSync(first)).toEqual(Buffer.from(a)); expect(readFileSync(second)).toEqual(Buffer.from(b));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('CLI rejects invalid flags, pages, sources and existing outputs without overwriting', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pdf-merge-'));
  try {
    const first = join(dir, 'first.pdf'), output = join(dir, 'merged.pdf'), alias = join(dir, 'alias.pdf');
    writeFileSync(first, mergeFixture('Alpha')); symlinkSync(first, alias);
    for (const flags of [[], ['--pages', '0'], ['--pages', '3'], ['--pages', '1', '--pages', '2'], ['--source'], ['--source', 'missing.pdf'], ['--unknown', '1'], ['--output', output, '--output', output], ['--pages', '']]) {
      const result = await run([first, 'pdf', 'merge', ...flags, ...(!flags.length ? [] : ['--output', output])]);
      expect(result.code).toBe(1); expect(existsSync(output)).toBe(false);
    }
    for (const path of [first, alias]) expect((await run([first, 'pdf', 'merge', '--output', path])).code).toBe(1);
    writeFileSync(output, 'keep');
    expect((await run([first, 'pdf', 'merge', '--output', output])).code).toBe(1);
    expect(readFileSync(output, 'utf8')).toBe('keep');
    const { mergePdf, ...host } = createFileHost();
    expect((await run([first, 'pdf', 'merge', '--output', output], host)).stderr).toContain('unavailable');
    expect((await run([first, 'pdf', 'merge', '--help'])).stdout).toContain('--source');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
