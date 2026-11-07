/** Run with PDF_PYTHON pointing to a Python installation with pypdfium2. */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergePdfPages, openPdfDocument } from '../../packages/pdf/src/index.ts';
import { mergeFixture } from '../../packages/pdf/test/merge-fixtures.ts';
import { extractionFixture } from '../../packages/pdf/test/extraction-fixture.ts';

const root = fileURLToPath(new URL('../../packages/pdf/test/fixtures/', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'tumbler-merge-oracle-'));
try {
  const fixtures: { name: string; bytes: Uint8Array; password?: string }[] = [
    { name: 'generated-alpha', bytes: mergeFixture('Alpha') },
    { name: 'generated-beta', bytes: mergeFixture('Beta', 1) },
    { name: 'generated-unicode', bytes: await extractionFixture('é') },
    ...readdirSync(root).filter((name) => name.endsWith('.pdf') && !['broken-xref.pdf', 'truncated.pdf'].includes(name))
      .map((name) => ({ name: name.slice(0, -4), bytes: readFileSync(join(root, name)), ...(name.startsWith('encrypted-') ? { password: 'fixture-password' } : {}) })),
  ];
  const manifest: { name: string; password?: string }[] = [];
  for (const fixture of fixtures) {
    const document = openPdfDocument(fixture.bytes, fixture.password === undefined ? {} : { password: fixture.password });
    const output = mergePdfPages([{ document }, { document, pages: document.pages.map((_, index) => index).reverse() }]);
    writeFileSync(join(directory, `${fixture.name}-source.pdf`), fixture.bytes);
    writeFileSync(join(directory, `${fixture.name}-merged.pdf`), output);
    manifest.push({ name: fixture.name, ...(fixture.password === undefined ? {} : { password: fixture.password }) });
  }
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest));
  const process = Bun.spawnSync([Bun.env.PDF_PYTHON ?? 'python3', fileURLToPath(new URL('./merge-oracle.py', import.meta.url)), directory], { stdout: 'inherit', stderr: 'inherit' });
  if (process.exitCode !== 0) throw new Error(`PDFium merge comparison failed with exit ${process.exitCode}.`);
} finally { rmSync(directory, { recursive: true, force: true }); }
