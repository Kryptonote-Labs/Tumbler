import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openWordArtifact, wordParagraphText } from '@tumblerjs/word';

test('off-page dragging and resizing stay visually clipped without restricting saved geometry', async ({ page }) => {
  await page.goto('/playground/word-brief');
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.75');
  const drawing = page.getByRole('button', { name: 'Select A rising progress line across six milestones', exact: true });
  await drawing.click();
  await page.getByLabel('Drawing layout', { exact: true }).selectOption('front');
  const paper = page.locator('.word-page').first();
  const bounds = (await paper.boundingBox())!;
  const before = (await drawing.boundingBox())!;
  const center = { x: before.x + before.width / 2, y: before.y + before.height / 2 };

  // At 75% zoom a screen pixel equals one document point.
  const dx = bounds.x - before.x - 20;
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + dx, center.y, { steps: 8 });
  await expect.poll(async () => (await drawing.boundingBox())!.x).toBeCloseTo(bounds.x - 20, 0);
  const left = page.getByRole('button', { name: 'Resize drawing left', exact: true });
  expect(await left.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return document.elementsFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2).includes(element);
  })).toBe(false);
  await page.mouse.up();
  await expect.poll(async () => (await drawing.boundingBox())!.x).toBeCloseTo(bounds.x - 20, 0);

  // Keyboard movement uses the same unrestricted coordinates as pointer movement.
  await drawing.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await drawing.boundingBox())!.x).toBeCloseTo(bounds.x - 21, 0);
  const right = page.getByRole('button', { name: 'Resize drawing right', exact: true });
  const handle = (await right.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width + 40, handle.y + handle.height / 2, { steps: 8 });
  expect(await right.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return document.elementsFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2).includes(element);
  })).toBe(false);
  await page.mouse.up();
  const resized = (await drawing.boundingBox())!;
  expect(resized.width).toBeGreaterThan(bounds.width);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: false }).click();
  const download = await downloadPromise;
  const artifact = openWordArtifact(new Uint8Array(await readFile((await download.path())!)));
  const exported = [...artifact.document.drawings.values()][0]!;
  expect(exported.anchor!.horizontalOffsetPoints).toBeCloseTo(-21, 0);
  expect(exported.widthPoints).toBeCloseTo(resized.width, 0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await drawing.boundingBox())!.width).toBeCloseTo(before.width, 0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(async () => (await drawing.boundingBox())!.width).toBeCloseTo(resized.width, 0);
});

test('resize an embedded drawing at reduced zoom, undo, redo, and export its dimensions', async ({ page }) => {
  await page.goto('/playground/word-brief');
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.75');
  const drawing = page.getByRole('button', { name: 'Select A rising progress line across six milestones', exact: true });
  await drawing.click();
  const before = (await drawing.boundingBox())!;
  const handle = page.getByRole('button', { name: 'Resize drawing', exact: true });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 100, box.y - 15, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText('Modified locally', { exact: true })).toBeVisible();
  await expect.poll(async () => (await drawing.boundingBox())!.width).toBeLessThan(before.width - 50);
  const resized = (await drawing.boundingBox())!;
  expect(resized.width / resized.height).toBeCloseTo(before.width / before.height, 2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await drawing.boundingBox())!.width).toBeCloseTo(before.width, 0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(async () => (await drawing.boundingBox())!.width).toBeCloseTo(resized.width, 0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: false }).click();
  const download = await downloadPromise;
  const artifact = openWordArtifact(new Uint8Array(await readFile((await download.path())!)));
  const exported = [...artifact.document.drawings.values()][0]!;
  expect(exported.widthPoints * 4 / 3 * 0.75).toBeCloseTo(resized.width, 0);
  expect(exported.heightPoints * 4 / 3 * 0.75).toBeCloseTo(resized.height, 0);
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(handle).toHaveCount(0);
});

test('drawing resize can be cancelled and adjusted with the keyboard', async ({ page }) => {
  await page.goto('/playground/word-brief');
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const drawing = page.getByRole('button', { name: 'Select A rising progress line across six milestones', exact: true });
  await drawing.click();
  const before = (await drawing.boundingBox())!;
  const handle = page.getByRole('button', { name: 'Resize drawing', exact: true });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 100, box.y - 15, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect.poll(async () => (await drawing.boundingBox())!.width).toBeCloseTo(before.width, 0);
  await expect(page.getByText('Local preview', { exact: true })).toBeVisible();
  await drawing.click();
  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await drawing.boundingBox())!.width).toBeCloseTo(before.width - 4 / 3, 0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await drawing.boundingBox())!.width).toBeCloseTo(before.width, 0);
});

test('drawings move on the page, resize from the opposite corner, and retain exported placement', async ({ page }) => {
  await page.goto('/playground/word-brief');
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.75');
  const drawing = page.getByRole('button', { name: 'Select A rising progress line across six milestones', exact: true });
  await drawing.click();
  await page.getByLabel('Drawing layout', { exact: true }).selectOption('front');
  const position = () => drawing.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const parent = element.closest('.word-page-content')!.getBoundingClientRect();
    return { x: rect.x - parent.x, y: rect.y - parent.y, width: rect.width, height: rect.height };
  });
  const before = await position();
  const rect = (await drawing.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 30, rect.y + rect.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByLabel('Drawing layout', { exact: true })).toHaveValue('front');
  await expect.poll(async () => (await position()).x).toBeCloseTo(before.x + 30, 0);
  await expect.poll(async () => (await position()).y).toBeCloseTo(before.y + 40, 0);
  const moved = await position();
  const topLeft = (await page.getByRole('button', { name: 'Resize drawing top left', exact: true }).boundingBox())!;
  await page.mouse.move(topLeft.x + topLeft.width / 2, topLeft.y + topLeft.height / 2);
  await page.mouse.down();
  await page.mouse.move(topLeft.x + 65, topLeft.y + 15, { steps: 8 });
  await page.mouse.up();
  const resized = await position();
  expect(resized.width).toBeLessThan(moved.width - 40);
  expect(resized.x + resized.width).toBeCloseTo(moved.x + moved.width, 0);
  expect(resized.y + resized.height).toBeCloseTo(moved.y + moved.height, 0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await position()).width).toBeCloseTo(moved.width, 0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: false }).click();
  const download = await downloadPromise;
  const artifact = openWordArtifact(new Uint8Array(await readFile((await download.path())!)));
  const exported = [...artifact.document.drawings.values()][0]!;
  expect(exported.anchor!.horizontalOffsetPoints).toBeCloseTo(moved.x, 0);
  expect(exported.anchor!.verticalOffsetPoints).toBeCloseTo(moved.y, 0);
  await page.getByLabel('Drawing layout', { exact: true }).selectOption('behind');
  await expect(page.locator('[data-word-drawing]')).toHaveClass(/behind/);
  await page.getByLabel('Drawing layout', { exact: true }).selectOption('inline');
  await expect(page.getByLabel('Drawing layout', { exact: true })).toHaveValue('inline');
});


test('inline dragging moves into text without changing layout and can be undone', async ({ page }) => {
  await page.goto('/playground/word-brief');
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.75');
  const drawing = page.getByRole('button', { name: 'Select A rising progress line across six milestones', exact: true });
  await drawing.click();
  const original = (await drawing.boundingBox())!;
  const destination = page.getByText('Progress at a glance', { exact: true });
  await destination.scrollIntoViewIfNeeded();
  const target = (await destination.boundingBox())!;
  const source = (await drawing.boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText('Modified locally', { exact: true })).toBeVisible();
  await drawing.click();
  await expect(page.getByLabel('Drawing layout', { exact: true })).toHaveValue('inline');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: false }).click();
  const download = await downloadPromise;
  const artifact = openWordArtifact(new Uint8Array(await readFile((await download.path())!)));
  expect([...artifact.document.drawings.values()][0]!.placement).toBe('inline');
  const paragraph = artifact.document.blocks.find(block => block.kind === 'paragraph' && wordParagraphText(artifact.document, block).includes('Progress at a glance'));
  expect(paragraph?.kind === 'paragraph' && wordParagraphText(artifact.document, paragraph)).toBe('\uFFFCProgress at a glance');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('Local preview', { exact: true })).toBeVisible();
  await drawing.click();
  const handle = (await page.getByRole('button', { name: 'Resize drawing top left', exact: true }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 65, handle.y + 15, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel('Drawing layout', { exact: true })).toHaveValue('inline');
  expect((await drawing.boundingBox())!.width).toBeLessThan(original.width);
});

for (const action of ['resize', 'move']) test(`zoom cancels an active drawing ${action} without an edit`, async ({ page }) => {
  await page.goto('/playground/word-brief');
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.75');
  const drawing = page.getByRole('button', { name: 'Select A rising progress line across six milestones', exact: true });
  await drawing.click();
  const before = (await drawing.boundingBox())!;
  const target = action === 'resize' ? page.getByRole('button', { name: 'Resize drawing', exact: true }) : drawing;
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 60, y - 20, { steps: 5 });
  await expect(page.locator('[data-word-drawing].moving')).toHaveCount(1);
  await page.locator('.word-scroller').evaluate(element => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -20, clientX: rect.left + 200, clientY: rect.top + 200, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('[data-word-drawing].moving')).toHaveCount(0);
  await expect.poll(() => target.evaluate(element => {
    // The active mouse pointer uses id 1 in Chromium.
    return element.hasPointerCapture(1);
  })).toBe(false);
  await page.mouse.move(x - 80, y - 30);
  await page.mouse.up();
  await expect(page.getByText('Local preview', { exact: true })).toBeVisible();
  const scale = Number(await page.getByLabel('Zoom', { exact: true }).inputValue());
  expect((await drawing.boundingBox())!.width / scale).toBeCloseTo(before.width / 0.75, 0);
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.75');
  await drawing.click();
  const handle = page.getByRole('button', { name: 'Resize drawing', exact: true });
  const next = (await handle.boundingBox())!;
  await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
  await page.mouse.down();
  await page.mouse.move(next.x - 50, next.y - 10, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText('Modified locally', { exact: true })).toBeVisible();
});
