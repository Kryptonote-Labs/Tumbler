import { test, expect, type Page } from '@playwright/test';

const paragraph = 'Build a small place to think, write, and work with documents. Keep the interface quiet and make the content easy to read.';

async function openEditor(page: Page) {
  await page.goto('/playground/word-brief');
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
}

async function wordPoint(page: Page, word: string) {
  return page.evaluate(word => {
    const element = [...document.querySelectorAll<HTMLElement>('.word-page-content [data-paragraph]:not(.caret-anchor)')].find(node => node.textContent?.includes(word));
    if (!element?.firstChild) throw new Error(`Missing text: ${word}`);
    const start = element.textContent!.indexOf(word);
    const range = document.createRange();
    range.setStart(element.firstChild, start);
    range.setEnd(element.firstChild, start + word.length);
    const rect = range.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, paragraph: element.dataset.paragraph! };
  }, word);
}

async function selectedText(page: Page) {
  return page.evaluate(() => getSelection()?.toString().replace(/\u200b/g, '').replace(/\s+/g, ' ').trim() ?? '');
}

test('triple-click selects the complete paragraph and replacement leaves its neighbours intact', async ({ page }) => {
  await openEditor(page);
  const point = await wordPoint(page, 'and work');
  await page.mouse.click(point.x, point.y, { clickCount: 3 });
  await expect.poll(() => selectedText(page)).toBe(paragraph);
  await page.keyboard.insertText('Replacement paragraph.');
  await expect(page.getByText('Replacement paragraph.', { exact: true })).toBeVisible();
  await expect(page.getByText('content easy to read.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Working principles', { exact: true })).toBeVisible();
});

test('dragging through the gap between wrapped lines stays in the paragraph', async ({ page }) => {
  await openEditor(page);
  const point = await wordPoint(page, 'and work');
  const lines = await page.evaluate(id => [...document.querySelectorAll<HTMLElement>(`[data-paragraph="${id}"]:not(.caret-anchor)`)].map(node => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }), point.paragraph);
  const [first, second] = lines;
  await page.mouse.move(first!.x + 120, first!.y + first!.height / 2);
  await page.mouse.down();
  await page.mouse.move(first!.x + 260, first!.y + first!.height / 2, { steps: 8 });
  await page.mouse.move(first!.x + 260, (first!.y + first!.height + second!.y) / 2, { steps: 6 });
  const text = await selectedText(page);
  expect(text.length).toBeGreaterThan(0);
  expect(paragraph).toContain(text);
  expect(text).not.toContain('Milestone');
  expect(text).not.toContain('FIELDNOTES');
  await page.mouse.up();
});

test('double-click selects a word, and shift-click extends the selection', async ({ page }) => {
  await openEditor(page);
  const point = await wordPoint(page, 'documents');
  await page.mouse.click(point.x, point.y, { clickCount: 2 });
  await expect.poll(() => selectedText(page)).toBe('documents');
  const end = await wordPoint(page, 'content easy');
  await page.keyboard.down('Shift');
  await page.mouse.click(end.x, end.y);
  await page.keyboard.up('Shift');
  const text = await selectedText(page);
  expect(text).toContain('documents. Keep the interface');
  expect(text).not.toContain('Milestone');
});

test('selecting down into a table follows document reading order', async ({ page }) => {
  await openEditor(page);
  const start = await wordPoint(page, 'Delivery plan');
  const end = await wordPoint(page, 'Prototype');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
  const text = await selectedText(page);
  expect(text).toContain('Milestone');
  expect(text).toContain('Owner');
  expect(text).not.toContain('FIELDNOTES');
  expect(text).not.toContain('Working principles');
});

test('backwards paragraph selection works at reduced zoom', async ({ page }) => {
  await openEditor(page);
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.75');
  const start = await wordPoint(page, 'content easy');
  await page.mouse.click(start.x, start.y, { clickCount: 3 });
  await expect.poll(() => selectedText(page)).toBe(paragraph);
  const end = await wordPoint(page, 'The goal');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
  const text = await selectedText(page);
  expect(text).toContain('Build a small place');
  expect(text).not.toContain('Milestone');
  expect(text).not.toContain('FIELDNOTES');
});

test('drag selection scrolls at the viewer edge and stops on release', async ({ page }) => {
  await openEditor(page);
  const start = await wordPoint(page, 'and work');
  const scroller = page.getByLabel('Document pages', { exact: true });
  const bounds = (await scroller.boundingBox())!;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, bounds.y + bounds.height + 30, { steps: 12 });
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(40);
  await page.mouse.up();
  const top = await scroller.evaluate(element => element.scrollTop);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await scroller.evaluate(element => element.scrollTop)).toBe(top);
});

test('paragraph selection also works in view mode', async ({ page }) => {
  await page.goto('/playground/word-brief');
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible();
  const point = await wordPoint(page, 'and work');
  await page.mouse.click(point.x, point.y, { clickCount: 3 });
  await expect.poll(() => selectedText(page)).toBe(paragraph);
});
