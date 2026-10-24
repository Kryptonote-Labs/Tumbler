import { test, expect } from '@playwright/test';
import { pictureInkStackFixture } from '../../../packages/word/test/picture-ink-fixture.ts';

test('Done remains clickable when an ink point extends below the drawing frame', async ({ page }) => {
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(pictureInkStackFixture()) }));
  await page.goto('/playground/word-brief');
  const drawings = page.locator('[data-word-drawing]');
  await expect(drawings).toHaveCount(4);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.75');
  const ink = drawings.last();
  await ink.locator('button.content').click();
  await ink.getByRole('button', { name: 'Edit points', exact: true }).click();
  const points = ink.getByRole('button', { name: /^Ink point 1 of / });
  await points.focus();
  // Extend the first point below the 20-point frame and its Done toolbar.
  for (let i = 0; i < 8; i++) await points.press('Shift+ArrowDown');
  const done = ink.getByRole('button', { name: 'Done', exact: true });
  const box = await done.boundingBox();
  const pointBox = await points.boundingBox();
  if (!box || !pointBox) throw Error('Missing ink controls');
  expect(pointBox.y + pointBox.height).toBeGreaterThan(box.y + box.height / 2);
  const layers = await done.evaluate(button => {
    const box = button.getBoundingClientRect();
    const wrapper = button.closest('[data-word-drawing]')!;
    const points = wrapper.querySelector('.points')!;
    return { controls: Number(getComputedStyle(button.parentElement!).zIndex), points: Number(getComputedStyle(points).zIndex), overlay: Number(getComputedStyle(wrapper).getPropertyValue('--word-ink-layer-z-index')), hit: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.getAttribute('aria-label') ?? document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.textContent };
  });
  console.log(JSON.stringify({ inkControls: layers }));
  // Raw mouse input must reach Done, without Playwright waiting for an obstructed locator.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(points).toHaveCount(0);
  await expect(ink.getByRole('button', { name: 'Edit points', exact: true })).toBeVisible();
  expect(layers.controls).toBeGreaterThan(layers.points);
  expect(layers.points).toBeGreaterThan(layers.overlay);
});
