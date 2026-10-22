import { test, expect } from '@playwright/test';
import { openWordArtifact } from '@tumblerjs/word';
import { pictureFixture } from '../../../packages/word/test/picture-fixture.ts';

test('stationary selected picture resize handle remains reachable', async ({ page }) => {
  const artifact = openWordArtifact(pictureFixture({ anchors: [0, 1, 2] }));
  const first = [...artifact.document.drawings.values()][0]!;
  const bytes = artifact.updateDrawing({ elementId: first.elementId, widthPoints: 72, heightPoints: 36, layout: 'front', xPoints: 50, yPoints: 72 }).bytes();
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(bytes) }));
  await page.goto('/playground/word-brief');
  await expect(page.locator('[data-word-drawing]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.75');
  const active = page.locator('[data-word-drawing]').first();
  await expect(active.getByRole('button', { name: 'Select Quadrants 0', exact: true })).toBeVisible();
  await active.scrollIntoViewIfNeeded();
  const bounds = await active.boundingBox();
  if (!bounds) throw new Error('Missing drawing');
  await page.mouse.click(bounds.x + 5, bounds.y + 18);
  await expect(active).toHaveClass(/selected/);
  await expect(active).not.toHaveClass(/moving/);
  const handle = active.getByRole('button', { name: 'Resize drawing right', exact: true });
  const inspect = () => handle.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { reachable: hit === element, selected: element.closest('[data-word-drawing]')?.getAttribute('data-word-drawing'), hitDrawing: hit?.closest('[data-word-drawing]')?.getAttribute('data-word-drawing'), hitLabel: hit?.getAttribute('aria-label') };
  });
  const selected = await inspect();
  const painted = await active.evaluate(element => {
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('[data-word-drawing]')?.getAttribute('data-word-drawing');
  });
  console.log(JSON.stringify({ selection: selected, painted }));
  expect(painted).toBe(await page.locator('[data-word-drawing]').last().getAttribute('data-word-drawing'));
  expect(selected.reachable).toBe(true);
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw Error('Missing resize handle');
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 12, handleBox.y + handleBox.height / 2, { steps: 4 });
  await expect(active).toHaveClass(/moving/);
  await page.mouse.up();
  await expect(active).not.toHaveClass(/moving/);
  await expect.poll(async () => (await active.boundingBox())!.width).toBeCloseTo(bounds.width + 12, 0);
});
