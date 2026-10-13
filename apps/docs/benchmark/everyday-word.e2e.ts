import { expect, test, type Page } from '@playwright/test';
import { openWordArtifact, wordParagraphText } from '@tumblerjs/word';
import { readFile } from 'node:fs/promises';

async function edit(page: Page) {
  await page.goto('/playground/word-brief');
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
}
async function point(page: Page, word: string) {
  return page.evaluate(word => {
    const node = [...document.querySelectorAll<HTMLElement>('.word-page-content [data-paragraph]:not(.caret-anchor)')].find(node => node.textContent?.includes(word));
    if (!node?.firstChild) throw new Error(`Missing ${word}`);
    const range = document.createRange(), start = node.textContent!.indexOf(word);
    range.setStart(node.firstChild, start); range.setEnd(node.firstChild, start + word.length);
    const box = range.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, word);
}
async function exported(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: false }).click();
  return openWordArtifact(new Uint8Array(await readFile((await (await pending).path())!)));
}
const selected = (page: Page) => page.evaluate(() => getSelection()?.toString().replace(/\u200b/g, '') ?? '');

test('everyday:editing.typing', async ({ page }) => {
  await edit(page);
  const target = await point(page, 'documents');
  await page.mouse.click(target.x, target.y, { clickCount: 2 });
  await expect.poll(() => selected(page)).toBe('documents');
  await page.keyboard.insertText('notes!');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(' now');
  await expect(page.locator('.word-page-content')).toContainText('notes now. Keep');
  const caret = await page.evaluate(() => getSelection()?.isCollapsed);
  expect(caret).toBe(true);
  const artifact = await exported(page);
  expect(artifact.document.blocks.filter(block => block.kind === 'paragraph').map(block => wordParagraphText(artifact.document, block)).join('\n')).toContain('notes now. Keep');
});

test('everyday:viewing.zoom', async ({ page }) => {
  await edit(page);
  for (const zoom of ['0.75', '1', '1.25']) {
    await page.getByLabel('Zoom', { exact: true }).selectOption(zoom);
    const target = await point(page, 'documents');
    await page.mouse.click(target.x, target.y, { clickCount: 2 });
    await expect.poll(() => selected(page)).toBe('documents');
    await expect(page.getByText('Working principles', { exact: true })).toBeVisible();
  }
});

test('everyday:viewing.selection', async ({ page }) => {
  await edit(page);
  const first = await point(page, 'documents');
  await page.mouse.click(first.x, first.y, { clickCount: 2 });
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => selected(page)).toBe('documents.');
  const start = await point(page, 'Delivery plan'), end = await point(page, 'Prototype');
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 12 }); await page.mouse.up();
  expect(await selected(page)).toContain('Milestone');
  expect(await selected(page)).toContain('Owner');
  const from = await point(page, 'documents'), to = await point(page, 'content easy');
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up();
  expect(await selected(page)).toContain('interface quiet');
});

test('everyday:viewing.pages', async ({ page }) => {
  await page.goto('/playground/word-pages?width=360');
  const scroller = page.getByLabel('Document pages', { exact: true });
  await expect(scroller.locator('.word-page')).toHaveCount(2);
  const before = await scroller.locator('.word-page-content').allTextContents();
  expect(before.every(text => text.trim().length > 0)).toBe(true);
  await scroller.evaluate(node => { node.scrollTop = node.scrollHeight; node.scrollLeft = 0; });
  await expect(page.getByText('A wider view', { exact: true })).toBeVisible();
  await scroller.evaluate(node => { node.scrollTop = 0; });
  expect(await scroller.locator('.word-page-content').allTextContents()).toEqual(before);
});

test('everyday:editing.clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await edit(page);
  await page.getByRole('textbox', { name: 'Edit page 1', exact: true }).click();
  await page.keyboard.press('Control+Home');
  await page.evaluate(async () => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob(['<p><b>PasteBold</b></p><ul><li>PasteBullet</li></ul>'], { type: 'text/html' }),
    'text/plain': new Blob(['PasteBold\nPasteBullet'], { type: 'text/plain' }),
  })]));
  await page.keyboard.press('Control+V');
  await expect(page.locator('.word-page-content')).toContainText('PasteBold');
  const artifact = await exported(page);
  const p = artifact.document.blocks.find(block => block.kind === 'paragraph' && wordParagraphText(artifact.document, block).includes('PasteBold'));
  expect(p?.kind).toBe('paragraph');
  if (p?.kind !== 'paragraph') throw new Error('Missing pasted paragraph');
  const run = p.inlines.find(inline => inline.kind === 'run');
  expect(run?.kind === 'run' && artifact.document.styles.runFormat(artifact.document, p, run).bold).toBe(true);
  expect([...artifact.document.numbering.markers(artifact.document).values()].some(marker => marker.text === '•')).toBe(true);
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+Shift+V');
  const plain = await exported(page);
  const first = plain.document.blocks.find(block => block.kind === 'paragraph');
  expect(first?.kind === 'paragraph' && plain.document.styles.runFormat(plain.document, first, first.inlines.find(inline => inline.kind === 'run')).bold).toBe(false);
});

test('everyday:editing.find-replace', async ({ page }) => {
  await edit(page);
  // No browser Ctrl+F fallback: this task requires document editing and undo.
  await expect(page.getByRole('button', { name: /find|replace|search/i }).first()).toBeVisible({ timeout: 1500 });
  throw new Error('Find UI is now available; add replacement and undo operations before awarding credit.');
});

test('everyday:viewing.outline', async ({ page }) => {
  await edit(page);
  await expect(page.getByRole('button', { name: /outline|headings|navigation pane/i }).first()).toBeVisible({ timeout: 1500 });
  throw new Error('Outline UI is now available; add heading navigation and selection assertions before awarding credit.');
});
