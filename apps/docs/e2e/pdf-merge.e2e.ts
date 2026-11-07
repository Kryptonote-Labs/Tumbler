import { test, expect } from '@playwright/test';
import { mergeFixture } from '../../../packages/pdf/test/merge-fixtures.ts';
import { mergePdfPages, openPdfDocument } from '@tumblerjs/pdf';
import { readFileSync } from 'node:fs';

test('graphical merge selections, reordering and duplication match the shared API byte for byte', async ({ page }) => {
  await page.goto('/playground/pdf-merge');
  await expect(page.getByLabel('Add PDFs')).toBeEnabled();
  const a = mergeFixture('Alpha'), b = mergeFixture('Beta', 1);
  await page.getByLabel('Add PDFs').setInputFiles([
    { name: 'alpha.pdf', mimeType: 'application/pdf', buffer: Buffer.from(a) },
    { name: 'beta.pdf', mimeType: 'application/pdf', buffer: Buffer.from(b) },
  ]);
  await expect(page.getByRole('button', { name: 'Merge and download' })).toBeEnabled();
  await page.getByLabel('Pages for alpha.pdf').fill('2-1');
  await page.getByRole('button', { name: 'Duplicate source 1', exact: true }).click();
  await page.getByLabel('Pages for alpha.pdf').nth(1).fill('2,2');
  await page.getByRole('button', { name: 'Move source 2 down', exact: true }).click();
  await page.getByLabel('Output filename').fill('assembled.pdf');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Merge and download' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('assembled.pdf');
  const expected = mergePdfPages([{ document: openPdfDocument(a), pages: [1, 0] }, { document: openPdfDocument(b) }, { document: openPdfDocument(a), pages: [1, 1] }]);
  expect(readFileSync((await download.path())!)).toEqual(Buffer.from(expected));
  await expect(page.getByRole('status')).toHaveText('Merged 6 pages.');
  await page.getByLabel('Pages for beta.pdf').fill('3');
  await page.getByRole('button', { name: 'Merge and download' }).click();
  await expect(page.getByRole('alert')).toContainText('1-2');
  await page.getByRole('button', { name: 'Remove source 2', exact: true }).click();
  await expect(page.getByLabel('Pages for beta.pdf')).toHaveCount(0);
});

test('malformed uploads show an error and leave the existing selections available', async ({ page }) => {
  await page.goto('/playground/pdf-merge');
  await expect(page.getByLabel('Add PDFs')).toBeEnabled();
  await page.getByLabel('Add PDFs').setInputFiles({ name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') });
  await expect(page.getByRole('alert')).toContainText('PDF header');
  await expect(page.getByRole('button', { name: 'Merge and download' })).toBeDisabled();
});
