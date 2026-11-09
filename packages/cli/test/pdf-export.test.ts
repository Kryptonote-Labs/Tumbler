import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPdfDocument, PdfInterpreter } from '@tumblerjs/pdf';
import { pdfFixture, pdfStream } from '../../pdf/test/pdf-fixture.ts';
import { runTumbler, type OperationHost } from '../src/index.ts';
import { createFileHost } from '../src/file-host.ts';
import { pdfPageIndices } from '../src/pdf-pages.ts';

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

test('PDF export preserves requested mixed-range order and source content in a standalone file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tumbler-pdf-export-'));
  try {
    const input = join(dir, 'input.pdf'), output = join(dir, 'selected.pdf');
    writeFileSync(input, sourceBytes);
    const result = await run([input, 'export', '--pages=5,2-3,1', '--output', output, '--format', 'pdf']);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ output, format: 'pdf', pages: [5, 2, 3, 1], pageCount: 4 });
    const original = openPdfDocument(sourceBytes), exported = openPdfDocument(readFileSync(output));
    const interpreter = new PdfInterpreter(exported);
    expect(exported.pages.map((p) => interpreter.page(p.index).text)).toEqual(['PAGE 5', 'PAGE 2', 'PAGE 3', 'PAGE 1']);
    for (const [i, index] of [4, 1, 2, 0].entries()) {
      expect(exported.contents(exported.pages[i]!)).toEqual(original.contents(original.pages[index]!));
      expect(exported.pages[i]!.rotation).toBe(90);
      expect(exported.pages[i]!.width).toBe(300);
    }
    expect(exported.source.revisions).toHaveLength(1);
    expect(readFileSync(output).toString()).not.toContain('PAGE 4');
    expect(readFileSync(input)).toEqual(Buffer.from(sourceBytes));
    const all = join(dir, 'all.pdf');
    const full = await run([input, 'export', '--output', all]);
    expect(full.code).toBe(0);
    expect(JSON.parse(full.stdout).pages).toEqual([1, 2, 3, 4, 5]);
    expect(openPdfDocument(readFileSync(all)).pages).toHaveLength(5);
    const reversed = join(dir, 'reversed.pdf');
    expect((await run([input, 'export', '--pages', '5-3,1', '--output', reversed])).code).toBe(0);
    const reverseDoc = openPdfDocument(readFileSync(reversed)), reverseInterpreter = new PdfInterpreter(reverseDoc);
    expect(reverseDoc.pages.map((p) => reverseInterpreter.page(p.index).text)).toEqual(['PAGE 5', 'PAGE 4', 'PAGE 3', 'PAGE 1']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('invalid export selections and flags fail without producing a file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tumbler-pdf-export-'));
  try {
    const input = join(dir, 'input.pdf'), output = join(dir, 'selected.pdf');
    writeFileSync(input, sourceBytes);
    for (const pages of ['', '0', '-1', '1.5', '1,,2', '1-', 'all', '1-6', '999999999999999999999', '1,1', '1-3,2', '1-9007199254740991']) {
      const result = await run([input, 'export', '--pages', pages, '--output', output]);
      expect(result.code).toBe(1);
      expect(result.stderr.length).toBeGreaterThan(0);
      expect(existsSync(output)).toBe(false);
    }
    for (const flags of [
      ['--pages', '1'],
      ['--pages', '1', '--output', output, '--format', 'png'],
      ['--pages', '1', '--output', output, '--pages', '2'],
      ['--pages', '1', '--output', output, '--unknown', 'x'],
      ['--pages', '1', '--output', join(dir, 'bad.txt')],
    ]) {
      expect((await run([input, 'export', ...flags])).code).toBe(1);
      expect(existsSync(output)).toBe(false);
    }
    expect(readFileSync(input)).toEqual(Buffer.from(sourceBytes));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('export refuses existing outputs, including the source and symlinks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tumbler-pdf-export-'));
  try {
    const input = join(dir, 'input.pdf'), output = join(dir, 'existing.pdf'), alias = join(dir, 'alias.pdf');
    writeFileSync(input, sourceBytes);
    writeFileSync(output, 'keep me');
    symlinkSync(input, alias);
    for (const destination of [input, output, alias])
      expect((await run([input, 'export', '--pages', '1', '--output', destination])).code).toBe(1);
    expect(readFileSync(input)).toEqual(Buffer.from(sourceBytes));
    expect(readFileSync(output, 'utf8')).toBe('keep me');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('export dispatches through injected hosts and reports unavailable hosts', async () => {
  const calls: unknown[] = [];
  const host = { ...createFileHost(), exportPdf: async (document: string, input: unknown) => { calls.push({ document, input }); return { saved: true }; } };
  const result = await run(['doc-id', 'export', '--pages', '5,2-4', '--output', 'new.pdf'], host);
  expect(result.code).toBe(0);
  expect(calls).toEqual([{ document: 'doc-id', input: { pages: '5,2-4', output: 'new.pdf', format: 'pdf' } }]);
  const { exportPdf, ...unsupported } = host;
  expect((await run(['doc-id', 'export', '--pages', '1', '--output', 'new.pdf'], unsupported)).stderr).toContain('unavailable');
});

test('selection expansion preserves written order and accepts surrounding whitespace', () => {
  expect(pdfPageIndices(' 5, 2 - 4 ,1 ', 5)).toEqual([4, 1, 2, 3, 0]);
  expect(pdfPageIndices('3-1', 5)).toEqual([2, 1, 0]);
});
