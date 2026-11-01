import { test, expect } from '@playwright/test';

test('thumbnail reordering preserves selection, supports undo, and cancels without edits', async ({ page }) => {
  await page.goto('/playground/slides-brief');
  const rail = page.getByRole('navigation', { name: 'Slides', exact: true });
  const buttons = rail.getByRole('button');
  const labels = () => buttons.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
  await expect(buttons.nth(2)).toBeVisible();
  const original = await labels();
  expect(original.length).toBeGreaterThanOrEqual(3);
  // Read-only viewing must not allow a drag to modify the deck.
  await buttons.nth(1).dragTo(buttons.nth(0));
  await expect.poll(labels).toEqual(original);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await buttons.nth(1).click();
  const selectedTitle = original[1]!.replace(/^Slide 2: /, '');
  const first = (await buttons.nth(0).boundingBox())!;
  const second = (await buttons.nth(1).boundingBox())!;
  const begin = async () => {
    await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2);
    await page.mouse.down();
    await page.mouse.move(first.x + first.width / 2, first.y + 2, { steps: 8 });
    await expect(page.locator('.drag-preview')).toBeVisible();
    await expect(rail.locator('.drop-line')).toBeVisible();
  };
  await begin();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.drag-preview')).toHaveCount(0);
  await expect.poll(labels).toEqual(original);
  // A cancelled drag must leave ordinary thumbnail selection working.
  await buttons.nth(0).click();
  await expect(buttons.nth(0)).toHaveAttribute('aria-current', 'true');
  await buttons.nth(1).click();
  await begin();
  await page.mouse.up();
  await expect(buttons.nth(0)).toHaveAttribute('aria-label', `Slide 1: ${selectedTitle}`);
  await expect(buttons.nth(0)).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(labels).toEqual(original);
  await buttons.nth(1).click();
  await buttons.nth(1).press('Alt+ArrowDown');
  await expect(buttons.nth(2)).toHaveAttribute('aria-label', `Slide 3: ${selectedTitle}`);
  await expect(buttons.nth(2)).toBeFocused();
  // Dropping outside the rail must keep the order unchanged.
  const beforeOutside = await buttons.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
  const moving = (await buttons.nth(2).boundingBox())!;
  await page.mouse.move(moving.x + moving.width / 2, moving.y + moving.height / 2);
  await page.mouse.down();
  await page.mouse.move(moving.x + moving.width + 100, moving.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect.poll(labels).toEqual(beforeOutside);
});

test('touch swipes scroll thumbnails while the number grip reorders', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, viewport: { width: 900, height: 700 } });
  const page = await context.newPage();
  try {
    await page.goto('/playground/slides-brief');
    const rail = page.getByRole('navigation', { name: 'Slides', exact: true });
    const buttons = rail.getByRole('button');
    await expect(buttons.nth(2)).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await rail.evaluate(node => { node.style.height = '160px'; });
    const labels = () => buttons.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
    const original = await labels();
    const cdp = await context.newCDPSession(page);
    const swipe = async (x: number, y: number, endY: number) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 10; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (endY - y) * step / 10 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const bounds = (await rail.boundingBox())!;
    await swipe(bounds.x + bounds.width * .7, bounds.y + 130, bounds.y + 20);
    await expect.poll(() => rail.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await expect.poll(labels).toEqual(original);
    await expect(page.locator('.drag-preview')).toHaveCount(0);
    // Expand the rail for a deliberate grip drag, after native scroll inertia settles.
    await rail.evaluate(node => { node.style.height = '100%'; node.scrollTop = 0; });
    const grip = (await buttons.nth(1).locator('.number').boundingBox())!;
    const first = (await buttons.nth(0).boundingBox())!;
    await swipe(grip.x + grip.width / 2, grip.y + 10, first.y + 2);
    await expect(buttons.nth(0)).toHaveAttribute('aria-label', original[1]!.replace(/^Slide 2:/, 'Slide 1:'));
  } finally {
    await context.close();
  }
});
