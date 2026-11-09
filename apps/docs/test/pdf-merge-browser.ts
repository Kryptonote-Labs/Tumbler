/// <reference types="bun" />
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { mergePdfDocuments, openPdfDocument, parsePdfPageSelection } from '../../../packages/pdf/src/index.ts';
import { pdfFixture, pdfStream } from '../../../packages/pdf/test/pdf-fixture.ts';

function source(label: string, count: number) {
  return pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${count} /Kids [${Array.from({ length: count }, (_, i) => `${3 + i * 2} 0 R`).join(' ')}] /MediaBox [0 0 300 200] /Resources << /Font << /F << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>`,
    ...Array.from({ length: count }, (_, i) => [
      `<< /Type /Page /Parent 2 0 R /Contents ${4 + i * 2} 0 R >>`,
      pdfStream(`BT /F 12 Tf 20 150 Td (${label} page ${i + 1}) Tj ET`),
    ]).flat(),
  ]);
}
async function output(page: Page) {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Merge and download PDF' }).click();
  const download = await downloaded;
  return { bytes: await Bun.file((await download.path())!).bytes(), name: download.suggestedFilename() };
}

const build = Bun.spawn([process.execPath, resolve(import.meta.dir, 'pdf-merge-fixture.ts')], { stdout: 'pipe', stderr: 'pipe' });
const [code, fixture, error] = await Promise.all([build.exited, new Response(build.stdout).text(), new Response(build.stderr).text()]);
if (code !== 0) throw new Error(error);
const { script, worker } = JSON.parse(fixture) as { script: string; worker: string };
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
try {
  const page = await browser.newPage(), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fixture.local/**', route => route.fulfill(new URL(route.request().url()).pathname === '/render.worker.ts' ? { contentType: 'text/javascript', body: worker } : { contentType: 'text/html', body: '<!doctype html><body style="height:800px;width:380px"></body>' }));
  await page.goto('https://fixture.local/');
  await page.addScriptTag({ type: 'module', content: script });
  const first = source('Alpha', 3), second = source('Beta', 2);
  const a = openPdfDocument(first), b = openPdfDocument(second);
  await page.locator('input[type=file]').setInputFiles([
    { name: 'alpha.pdf', mimeType: 'application/pdf', buffer: Buffer.from(first) },
    { name: 'beta.pdf', mimeType: 'application/pdf', buffer: Buffer.from(second) },
  ]);
  await page.getByText('5 pages', { exact: true }).waitFor();
  const all = await output(page);
  assert.equal(all.name, 'alpha merged.pdf');
  assert.deepEqual(all.bytes, mergePdfDocuments([{ document: a }, { document: b }]));

  const group = (name: string, index = 0) => page.getByRole('group', { name, exact: true }).nth(index);
  async function range(name: string, value: string, index = 0) {
    const row = group(name, index);
    const input = row.getByRole('textbox', { name: `Include pages in ${name}`, exact: true });
    if (!(await input.isVisible())) await row.getByRole('button', { expanded: false }).click();
    await input.fill(value);
    return input;
  }
  async function option(name: string, action: string, index = 0) {
    const row = group(name, index);
    await row.getByRole('button', { name: `Options for ${name}`, exact: true }).click();
    await row.getByRole('button', { name: action, exact: true }).click();
  }
  await group('beta.pdf').locator('.thumbnail:not(.pending)').first().waitFor();
  assert.ok(await group('beta.pdf').locator('canvas').first().evaluate((canvas: HTMLCanvasElement) => canvas.width > 0 && canvas.height > 0));
  await range('alpha.pdf', '3-1,1');
  await range('beta.pdf', '2,1');
  await option('alpha.pdf', 'Duplicate');
  await range('alpha.pdf', '2', 1);
  await option('alpha.pdf', 'Move down', 1);
  await page.getByLabel('Output filename').fill('interleaved.pdf');
  const selected = await output(page);
  assert.equal(selected.name, 'interleaved.pdf');
  const expected = mergePdfDocuments([
    { document: a, pages: parsePdfPageSelection('3-1,1', 3) },
    { document: b, pages: parsePdfPageSelection('2,1', 2) },
    { document: a, pages: [1] },
  ]);
  assert.deepEqual(selected.bytes, expected);
  const reopened = openPdfDocument(selected.bytes);
  assert.equal(reopened.pages.length, 7);
  assert.deepEqual(reopened.pages.map(p => new TextDecoder().decode(reopened.contents(p)).match(/\(([^)]+)\)/)?.[1]), [
    'Alpha page 3', 'Alpha page 2', 'Alpha page 1', 'Alpha page 1', 'Beta page 2', 'Beta page 1', 'Alpha page 2',
  ]);

  await range('alpha.pdf', '4');
  assert.equal(await page.getByRole('button', { name: 'Merge and download PDF' }).isDisabled(), true);
  await page.getByText('Use page numbers from 1 to 3, or ranges such as 1-2.', { exact: true }).waitFor();
  await range('alpha.pdf', '0');
  assert.equal(await page.getByRole('button', { name: 'Merge and download PDF' }).isDisabled(), true);
  await range('alpha.pdf', '1,,2');
  assert.equal(await page.getByRole('button', { name: 'Merge and download PDF' }).isDisabled(), true);
  await range('alpha.pdf', '');
  await page.getByLabel('Output filename').fill('bad.txt');
  await page.getByRole('button', { name: 'Merge and download PDF' }).click();
  await page.getByText('Choose a file name ending in .pdf.', { exact: true }).waitFor();
  await page.getByLabel('Output filename').fill('merged.pdf');

  await page.locator('input[type=file]').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('broken') });
  await group('broken.pdf').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Merge and download PDF' }).isDisabled(), true);
  await option('broken.pdf', 'Remove');
  const encrypted = await Bun.file(resolve(import.meta.dir, '../../../packages/pdf/test/fixtures/encrypted-aes128.pdf')).bytes();
  await page.locator('input[type=file]').setInputFiles({ name: 'locked.pdf', mimeType: 'application/pdf', buffer: Buffer.from(encrypted) });
  const password = page.getByLabel('Password for locked.pdf', { exact: true });
  await password.waitFor();
  assert.equal(await page.getByRole('button', { name: 'Merge and download PDF' }).isDisabled(), true);
  await password.fill('wrong');
  assert.equal(await page.getByRole('button', { name: 'Merge and download PDF' }).isDisabled(), true);
  await password.fill('fixture-password');
  const unlocked = await output(page);
  const opened = openPdfDocument(unlocked.bytes);
  assert.equal(opened.source.encrypted, false);
  assert.equal(opened.pages.length, 3 + 2 + 1 + openPdfDocument(encrypted, { password: 'fixture-password' }).pages.length);
  await option('locked.pdf', 'Remove');
  await option('alpha.pdf', 'Remove', 1);
  await option('beta.pdf', 'Remove');
  await option('alpha.pdf', 'Remove');
  assert.equal(await page.getByRole('button', { name: 'Merge and download PDF' }).isDisabled(), true);
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
