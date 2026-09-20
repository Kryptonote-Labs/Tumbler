import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openWordArtifact, wordParagraphText } from '@tumblerjs/word';
import { openSpreadsheetArtifact } from '@tumblerjs/sheets';

// These exercise the real browser layout and exported files, not source markup.
test('docs navigation works on desktop and a narrow screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Office documents, in your app.' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Documentation', exact: true }).getByRole('link', { name: 'Installation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Installation', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('navigation', { name: 'Documentation', exact: true }).getByRole('link', { name: 'Compatibility', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Compatibility', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('both page edges are reachable in a narrow viewer at different zoom levels', async ({ page }) => {
  await page.goto('/playground/word-pages?width=360');
  const scroller = page.getByLabel('Document pages', { exact: true });
  await expect(scroller.locator('.word-page').first()).toBeVisible();
  for (const zoom of ['0.75', '1', '1.25']) {
    await page.getByLabel('Zoom', { exact: true }).selectOption(zoom);
    await expect.poll(async () => scroller.evaluate(element => {
      element.scrollLeft = 0;
      const page = element.querySelector('.word-page')!;
      return page.getBoundingClientRect().left - element.getBoundingClientRect().left;
    })).toBeGreaterThanOrEqual(0);
    await expect.poll(async () => scroller.evaluate(element => {
      element.scrollLeft = element.scrollWidth;
      const page = element.querySelector('.word-page')!;
      return page.getBoundingClientRect().right - (element.getBoundingClientRect().left + element.clientWidth);
    })).toBeLessThanOrEqual(1);
  }
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  await scroller.evaluate(element => { element.scrollTop = element.scrollHeight; element.scrollLeft = 0; });
  await expect(page.getByText('A wider view', { exact: true })).toBeVisible();
  const edges = await scroller.evaluate(element => Array.from(element.querySelectorAll('.word-page'), page => page.getBoundingClientRect().left - element.getBoundingClientRect().left));
  expect(edges.every(left => left >= 0)).toBe(true);
});

test('mixed page sizes centre fitting pages within the viewer', async ({ page }) => {
  await page.goto('/playground/word-pages');
  const scroller = page.getByLabel('Document pages', { exact: true });
  await expect(scroller.locator('.word-page').first()).toBeVisible();
  for (const width of [1440, 1250]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByLabel('Zoom', { exact: true }).selectOption('0.75');
    await expect.poll(() => scroller.evaluate(element => {
      const portrait = element.querySelector('.word-page')!.getBoundingClientRect();
      const viewer = element.getBoundingClientRect();
      return Math.abs((portrait.left + portrait.right) / 2 - (viewer.left + element.clientWidth / 2));
    })).toBeLessThan(1);
  }
  await scroller.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByText('A wider view', { exact: true })).toBeVisible();
  await expect.poll(() => scroller.evaluate(element => {
    element.scrollLeft = element.scrollWidth;
    const landscape = element.querySelector('.word-page:last-child')!.getBoundingClientRect();
    return landscape.right - (element.getBoundingClientRect().left + element.clientWidth);
  })).toBeLessThanOrEqual(1);
});

test('Word edits can be downloaded and reopened, then reset', async ({ page }) => {
  await page.goto('/playground/word-brief');
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Edit page 1', exact: true });
  await editor.click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.insertText('Edited sample. ');
  await expect(page.getByText('Modified locally', { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: false }).click();
  const download = await downloadPromise;
  const bytes = new Uint8Array(await readFile((await download.path())!));
  const document = openWordArtifact(bytes).document;
  expect(document.blocks.filter(block => block.kind === 'paragraph').map(block => wordParagraphText(document, block)).join('\n')).toContain('Edited sample.');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByText('Local preview', { exact: true })).toBeVisible();
  await expect(page.getByText('Edited sample.', { exact: false })).toHaveCount(0);
});

test('spreadsheet edits recalculate and survive export across sheets', async ({ page }) => {
  await page.goto('/playground/sheet-budget');
  await expect(page.getByRole('gridcell', { name: 'Research', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('gridcell', { name: '85', exact: true }).first().dblclick();
  const input = page.getByRole('textbox', { name: 'Edit C2', exact: true });
  await input.fill('100');
  await input.press('Enter');
  await expect(page.getByRole('gridcell', { name: '1200', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'About this workbook', exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: false }).click();
  const download = await downloadPromise;
  const artifact = openSpreadsheetArtifact(new Uint8Array(await readFile((await download.path())!)));
  expect(artifact.worksheet.cell('C2')?.value).toMatchObject({ type: 'number', value: 100 });
  expect(artifact.calculation.displayText('D2')).toBe('1200');
});

test('bad uploads report an error without discarding the open document', async ({ page }) => {
  await page.goto('/playground/word-brief');
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible();
  await page.getByLabel('Choose a document').setInputFiles({ name: 'broken.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a document') });
  await expect(page.getByRole('alert')).toContainText('Could not open this file');
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible();
});
