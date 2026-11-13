import { expect, test } from '@playwright/test';
import { createWordArtifact } from '@tumblerjs/word';

test('editing a later page retains scrolling and the next keystroke', async ({ page }) => {
  const artifact = createWordArtifact({ paragraphs: [
    ...Array.from({ length: 100 }, (_, index) => ({ runs: [{ text: `Paragraph ${index}. `.repeat(8) }] })),
    { runs: [{ text: 'Last paragraph' }] },
  ] });
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(artifact.bytes()) }));
  await page.goto('/playground/word-brief');
  await expect(page.locator('.word-page').first()).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const scroller = page.locator('.word-scroller');
  await scroller.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const last = page.getByText('Last paragraph', { exact: true });
  await expect(last).toBeVisible();
  await last.evaluate(element => {
    const text = element.firstChild!;
    element.closest<HTMLElement>('[contenteditable]')!.focus();
    getSelection()!.setBaseAndExtent(text, text.textContent!.length, text, text.textContent!.length);
    document.dispatchEvent(new Event('selectionchange'));
  });
  const before = await scroller.evaluate(element => element.scrollTop);
  expect(before).toBeGreaterThan(500);
  await page.keyboard.insertText('!');
  await expect(page.getByText('Last paragraph!', { exact: true })).toBeVisible();
  expect(await scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(before * 0.8);
  await page.keyboard.insertText(' Again');
  await expect(page.getByText('Last paragraph! Again', { exact: true })).toBeVisible();
});
