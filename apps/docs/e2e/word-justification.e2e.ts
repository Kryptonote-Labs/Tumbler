import { expect, test } from '@playwright/test';
import { createWordArtifact } from '@tumblerjs/word';

// Courier gives reproducible word advances across the DOM and layout measurer.
test('justified body spaces render their advances and retain editable caret boundaries', async ({ page }) => {
  const artifact = createWordArtifact({
    page: { width: 140, height: 300, margin: 20 },
    defaultFormat: { fontFamily: 'Courier New', fontSizePoints: 10 },
    paragraphs: [{ alignment: 'justify', runs: [{ text: 'one two three four five six seven' }] }],
  });
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(artifact.bytes()) }));
  await page.goto('/playground/word-brief');
  await expect(page.locator('.text-line').first()).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const geometry = await page.locator('.text-line').first().evaluate(line => {
    const fragments = [...line.querySelectorAll<HTMLElement>('[data-start]')];
    const first = fragments[0]!.getBoundingClientRect(), last = fragments.at(-1)!.getBoundingClientRect();
    const space = fragments.find(fragment => Number.parseFloat(getComputedStyle(fragment).wordSpacing) > 0)!;
    const bounds = space.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(space);
    return { width: last.right - first.left, spaceWidth: bounds.width, rangeWidth: range.getBoundingClientRect().width,
      left: bounds.left, y: bounds.top + bounds.height / 2, offset: Number(space.dataset.start) };
  });
  expect(geometry.width).toBeCloseTo(100 * 4 / 3, 0);
  expect(geometry.rangeWidth).toBeCloseTo(geometry.spaceWidth, 1);
  for (const fraction of [0.1, 0.9]) {
    await page.mouse.click(geometry.left + geometry.spaceWidth * fraction, geometry.y);
    const offset = await page.evaluate(() => {
      const selection = getSelection()!;
      const element = selection.focusNode?.parentElement;
      return Number(element?.dataset.start) + selection.focusOffset;
    });
    expect(offset).toBe(geometry.offset + (fraction > 0.5 ? 1 : 0));
  }
});
