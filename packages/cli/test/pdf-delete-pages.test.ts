import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync, readdirSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPdfDocument, PdfInterpreter } from '@tumblerjs/pdf';
import { pdfFixture, pdfStream } from '../../pdf/test/pdf-fixture.ts';
import { runTumbler, type OperationHost } from '../src/index.ts';
import { createFileHost } from '../src/file-host.ts';

const sourceBytes = pdfFixture([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 5 /Kids [3 0 R 4 0 R 5 0 R 6 0 R 7 0 R] /MediaBox [0 0 200 300] /Rotate 90 /Resources << /Font << /F 8 0 R >> >> >>',
  ...[9, 10, 11, 12, 13].map((ref) => `<< /Type /Page /Parent 2 0 R /Contents ${ref} 0 R >>`),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ...[1, 2, 3, 4, 5].map((n) => pdfStream(`BT /F 12 Tf 20 200 Td (PAGE ${n}) Tj ET\n10 10 20 20 re f`)),
]);
async function run(args: string[], host: OperationHost = createFileHost()) {
  let stdout = '', stderr = '';
  const code = await runTumbler(args, { host, stdout: (s) => { stdout += s; }, stderr: (s) => { stderr += s; } });
  return { code, stdout, stderr };
}


test('deletion preserves remaining page order, content, geometry and permissions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tumbler-pdf-delete-'));
  try {
    const input = join(dir, 'input.pdf');
    writeFileSync(input, sourceBytes);
    chmodSync(input, 0o640);
    const result = await run([input, 'pdf', 'delete-pages', '4-3,1']);
    expect(result).toEqual({ code: 0, stderr: '', stdout: JSON.stringify({ deletedPages: [1, 3, 4], pageCount: 2 }) + '\n' });
    const output = readFileSync(input), document = openPdfDocument(output), original = openPdfDocument(sourceBytes);
    const interpreter = new PdfInterpreter(document);
    expect(document.pages.map((p) => interpreter.page(p.index).text)).toEqual(['PAGE 2', 'PAGE 5']);
    for (const [i, index] of [1, 4].entries()) {
      expect(document.contents(document.pages[i]!)).toEqual(original.contents(original.pages[index]!));
      expect(document.pages[i]!.rotation).toBe(90);
      expect(document.pages[i]!.width).toBe(300);
    }
    expect(document.source.revisions).toHaveLength(1);
    for (const n of [1, 3, 4]) expect(output.toString()).not.toContain(`PAGE ${n}`);
    expect(statSync(input).mode & 0o777).toBe(0o640);
    expect(readdirSync(dir)).toEqual(['input.pdf']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('invalid selections and arguments leave the original untouched and clean up locks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tumbler-pdf-delete-'));
  try {
    const input = join(dir, 'input.pdf');
    writeFileSync(input, sourceBytes);
    for (const args of [
      [], [''], ['0'], ['-1'], ['1.5'], ['1,,2'], ['1-'], ['all'], ['6'], ['1-6'],
      ['999999999999999999999'], ['1-9007199254740991'], ['1,1'], ['1-3,2'],
      ['1-5'], ['5-1'], ['1', '2'], ['--pages', '1'], ['--unknown'],
    ]) {
      const result = await run([input, 'pdf', 'delete-pages', ...args]);
      expect(result.code).toBe(1);
      expect(result.stderr.length).toBeGreaterThan(0);
      expect(readFileSync(input)).toEqual(Buffer.from(sourceBytes));
      expect(readdirSync(dir)).toEqual(['input.pdf']);
    }
    writeFileSync(input, 'not a PDF');
    expect((await run([input, 'pdf', 'delete-pages', '1'])).code).toBe(1);
    expect(readFileSync(input, 'utf8')).toBe('not a PDF');
    expect(readdirSync(dir)).toEqual(['input.pdf']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('deletion resolves symlinks and respects existing sibling locks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tumbler-pdf-delete-'));
  try {
    const input = join(dir, 'input.pdf'), alias = join(dir, 'alias.pdf'), lock = `${input}.tumbler-lock`;
    writeFileSync(input, sourceBytes);
    symlinkSync(input, alias);
    writeFileSync(lock, 'another writer');
    expect((await run([alias, 'pdf', 'delete-pages', '2'])).code).toBe(1);
    expect(readFileSync(input)).toEqual(Buffer.from(sourceBytes));
    expect(readFileSync(lock, 'utf8')).toBe('another writer');
    rmSync(lock);
    expect((await run([alias, 'pdf', 'delete-pages', '2,4-5'])).code).toBe(0);
    expect(statSync(alias).size).toBe(statSync(input).size);
    expect(existsSync(lock)).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('PDF namespace supports injected hosts, local help and unknown command errors', async () => {
  const calls: unknown[] = [];
  const host = { ...createFileHost(), deletePdfPages: async (document: string, input: unknown) => { calls.push({ document, input }); return { saved: true }; } };
  expect((await run(['doc-id', 'pdf', 'delete-pages', '2,4-6'], host)).code).toBe(0);
  expect(calls).toEqual([{ document: 'doc-id', input: { pages: '2,4-6' } }]);
  const { deletePdfPages, ...unsupported } = host;
  expect((await run(['doc-id', 'pdf', 'delete-pages', '1'], unsupported)).stderr).toContain('unavailable');
  for (const args of [['--help'], ['missing.pdf', 'pdf'], ['missing.pdf', 'pdf', '--help'], ['missing.pdf', 'pdf', 'delete-pages', '--help']]) {
    const result = await run(args, unsupported);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('pdf');
  }
  expect((await run(['doc-id', 'pdf', 'unknown'], host)).stderr).toContain('Unknown PDF command');
  expect(calls).toHaveLength(1);
});
