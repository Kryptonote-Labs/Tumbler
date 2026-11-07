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

test('unsupported document data is rejected without changing any bytes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tumbler-pdf-delete-'));
  try {
    const input = join(dir, 'input.pdf');
    // Include the review fixture's structures individually as well as together,
    // so guarding just one entry cannot hide loss of the others.
    const entries = [
      '/Names << /EmbeddedFiles << /Names [(attachment.txt) 6 0 R] >> >>',
      '/Metadata 8 0 R',
      '/PageLabels << /Nums [0 << /S /r >>] >>',
      '/Names 9 0 R',
      '/Dests << /example [3 0 R /Fit] >>',
      '/ViewerPreferences << /HideToolbar true >>',
      '/CustomDocumentData (retain me)',
      '/MarkInfo << /Marked true /Suspects true >>',
    ];
    for (const entry of [...entries, entries.slice(0, 3).join(' ')]) {
      const original = pdfFixture([
        `<< /Type /Catalog /Pages 2 0 R ${entry} >>`,
        '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] /MediaBox [0 0 200 300] /Resources << >> >>',
        '<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>',
        '<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>',
        pdfStream(''),
        '<< /Type /Filespec /F (attachment.txt) /EF << /F 7 0 R >> >>',
        pdfStream('IMPORTANT ATTACHMENT', '/Type /EmbeddedFile'),
        pdfStream('<metadata>document metadata</metadata>', '/Type /Metadata /Subtype /XML'),
        '<< /EmbeddedFiles << /Names [(attachment.txt) 6 0 R] >> >>',
      ]);
      writeFileSync(input, original);
      const result = await run([input, 'pdf', 'delete-pages', '2']);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('unsupported document structures');
      expect(readFileSync(input)).toEqual(Buffer.from(original));
      expect(openPdfDocument(readFileSync(input)).pages).toHaveLength(2);
      expect(readdirSync(dir)).toEqual(['input.pdf']);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('trailer Info is rejected rather than silently discarding document properties', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tumbler-pdf-delete-'));
  try {
    const input = join(dir, 'input.pdf');
    // The trailer is after the xref table, so extending it leaves all offsets valid.
    const original = Buffer.from(sourceBytes).toString('latin1').replace(
      '/Root 1 0 R', '/Root 1 0 R /Info << /Title (Important title) >>',
    );
    writeFileSync(input, original, 'latin1');
    expect(openPdfDocument(readFileSync(input)).source.trailer.has('Info')).toBe(true);
    const before = readFileSync(input);
    const result = await run([input, 'pdf', 'delete-pages', '2']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('trailer /Info');
    expect(readFileSync(input)).toEqual(before);
    expect(readdirSync(dir)).toEqual(['input.pdf']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('replacement retains mode 0666 even under umask 022', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tumbler-pdf-delete-'));
  try {
    const input = join(dir, 'input.pdf');
    writeFileSync(input, sourceBytes);
    chmodSync(input, 0o666);
    // Isolate the process-wide umask from the test runner and other tests.
    const child = Bun.spawnSync([process.execPath, '-e', `
      import { createFileHost } from './packages/cli/src/file-host.ts';
      process.umask(0o022);
      await createFileHost().deletePdfPages(process.argv[1], { pages: '2' });
    `, input], { cwd: join(import.meta.dir, '../../..') });
    expect(child.stderr.toString()).toBe('');
    expect(child.exitCode).toBe(0);
    expect(openPdfDocument(readFileSync(input)).pages).toHaveLength(4);
    expect(statSync(input).mode & 0o777).toBe(0o666);
    expect(readdirSync(dir)).toEqual(['input.pdf']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
