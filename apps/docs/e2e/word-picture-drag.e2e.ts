import { test, expect } from '@playwright/test';
import { openWordArtifact } from '@tumblerjs/word';
import { pictureFixture } from '../../../packages/word/test/picture-fixture.ts';

test('dragging a lower-ranked picture raises the preview and restores its saved rank on release', async ({ page }, info) => {
  const artifact = openWordArtifact(pictureFixture({ anchors: [0, 1, 2] }));
  const first = [...artifact.document.drawings.values()][0]!;
  const bytes = artifact.updateDrawing({ elementId: first.elementId, widthPoints: 72, heightPoints: 36, layout: 'front', xPoints: 50, yPoints: 72 }).bytes();
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(bytes) }));
  await page.goto('/playground/word-brief');
  await expect(page.locator('[data-word-drawing]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.75');
  const drawings = page.locator('[data-word-drawing]');
  await expect(drawings).toHaveCount(3);
  const active = drawings.first();
  await expect(active.getByRole('button', { name: 'Select Quadrants 0', exact: true })).toBeVisible();
  await active.scrollIntoViewIfNeeded();
  const id = await active.getAttribute('data-word-drawing');
  const originalRank = await active.evaluate(element => getComputedStyle(element).zIndex);
  const box = await active.boundingBox();
  if (!box) throw Error('Missing drawing bounds');
  // The left edge is exposed. Move it over the higher-ranked pictures with a real pointer drag.
  await page.mouse.move(box.x + 5, box.y + 18);
  await page.mouse.down();
  await page.mouse.move(box.x + 27, box.y + 18, { steps: 5 });
  await expect(active).toHaveClass(/moving/);
  const state = await active.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { rank: Number(getComputedStyle(element).zIndex), hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('[data-word-drawing]')?.getAttribute('data-word-drawing') };
  });
  console.log(JSON.stringify({ dragPreview: { originalRank, ...state, expected: id } }));
  await page.screenshot({ path: info.outputPath('picture-drag.png') });
  expect(state.hit).toBe(id);
  expect(state.rank).toBeGreaterThan(4);
  await expect(active.getByRole('toolbar', { name: 'Drawing controls' })).toBeVisible();
  await page.mouse.up();
  await expect(active).not.toHaveClass(/moving/);
  await expect.poll(() => active.evaluate(element => getComputedStyle(element).zIndex)).toBe(originalRank);
});
