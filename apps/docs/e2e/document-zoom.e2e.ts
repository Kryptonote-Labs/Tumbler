import { test, expect } from '@playwright/test';

test('trackpad pinch zooms the document around the pointer and leaves normal scrolling intact', async ({ page }) => {
  await page.goto('/playground/word-pages?width=360');
  const scroller = page.getByLabel('Document pages', { exact: true });
  await expect(scroller.locator('.word-page').first()).toBeVisible();
  await scroller.scrollIntoViewIfNeeded();
  await scroller.evaluate(element => { element.scrollTop = 200; element.scrollLeft = 100; });
  const before = await scroller.evaluate(element => {
    const viewer = element.getBoundingClientRect();
    const sheet = element.querySelector('.word-page')!.getBoundingClientRect();
    const x = viewer.left + 180;
    const y = viewer.top + 220;
    return { x, y, width: sheet.width, u: (x - sheet.left) / sheet.width, v: (y - sheet.top) / sheet.height };
  });
  await page.mouse.move(before.x, before.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -30);
  await page.keyboard.up('Control');
  await expect.poll(() => scroller.locator('.word-page').first().evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(before.width);
  const after = await scroller.locator('.word-page').first().boundingBox();
  expect(Math.abs(after!.x + before.u * after!.width - before.x)).toBeLessThan(2);
  expect(Math.abs(after!.y + before.v * after!.height - before.y)).toBeLessThan(2);
  expect(Number(await page.getByLabel('Zoom', { exact: true }).inputValue())).toBeGreaterThan(1);
  expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1);
  const top = await scroller.evaluate(element => element.scrollTop);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(top);
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  await expect.poll(() => scroller.locator('.word-page').first().evaluate(element => element.getBoundingClientRect().width)).toBeCloseTo(before.width, 0);
});

test.describe('touch zoom', () => {
  test.use({ hasTouch: true });
  for (const sample of ['word-pages', 'sheet-budget']) test(`two fingers zoom ${sample} without zooming the site`, async ({ page }) => {
    await page.goto(`/playground/${sample}?width=360`);
    const scroller = page.locator(sample === 'word-pages' ? '.word-scroller' : '.grid-scroller');
    await expect(scroller).toBeVisible();
    await scroller.scrollIntoViewIfNeeded();
    const rect = (await scroller.boundingBox())!;
    const session = await page.context().newCDPSession(page);
    const touches = (spread: number) => [
      { x: rect.x + 180 - spread, y: rect.y + 220, id: 0 },
      { x: rect.x + 180 + spread, y: rect.y + 220, id: 1 },
    ];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(40) });
    for (const spread of [50, 60, 70, 80]) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(spread) });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => Number(await page.getByLabel('Zoom', { exact: true }).inputValue())).toBeCloseTo(2, 1);
    expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1);
    await session.detach();
  });
});


test('sheet zoom scales cells and headers while retaining editing and scrolling', async ({ page }) => {
  await page.goto('/playground/sheet-budget');
  const cell = page.getByRole('gridcell', { name: '85', exact: true }).first();
  await expect(cell).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const before = (await cell.boundingBox())!;
  const grid = page.getByRole('grid');
  const gridBefore = (await grid.boundingBox())!;
  await cell.hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -20);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await cell.boundingBox())!.width).toBeGreaterThan(before.width);
  const zoom = Number(await page.getByLabel('Zoom', { exact: true }).inputValue());
  expect((await cell.boundingBox())!.width / before.width).toBeCloseTo(zoom, 1);
  expect((await grid.boundingBox())!.width).toBeCloseTo(gridBefore.width, 0);
  expect((await grid.boundingBox())!.height).toBeCloseTo(gridBefore.height, 0);
  await cell.dblclick();
  const input = page.getByRole('textbox', { name: 'Edit C2', exact: true });
  await input.fill('100');
  await input.press('Enter');
  await expect(page.getByRole('gridcell', { name: '1200', exact: true })).toBeVisible();
  const scroller = page.locator('.grid-scroller');
  const top = await scroller.evaluate(element => element.scrollTop);
  await page.mouse.wheel(0, 150);
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(top);
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.5');
  await scroller.evaluate(element => { element.scrollTop = 0; element.scrollLeft = 0; });
  await expect(page.getByRole('gridcell', { name: 'Research', exact: true })).toBeVisible();
});


test('a burst of sheet pinch events retains the full zoom change', async ({ page }) => {
  await page.goto('/playground/sheet-budget');
  await expect(page.getByRole('gridcell', { name: 'Research', exact: true })).toBeVisible();
  const grid = page.getByRole('grid');
  await grid.evaluate(element => {
    const rect = element.getBoundingClientRect();
    for (let i = 0; i < 10; i++) element.dispatchEvent(new WheelEvent('wheel', {
      ctrlKey: true, deltaY: -2, clientX: rect.left + 400, clientY: rect.top + 200, bubbles: true, cancelable: true,
    }));
  });
  await expect.poll(async () => Number(await page.getByLabel('Zoom', { exact: true }).inputValue())).toBeCloseTo(Math.exp(0.2), 5);
});

test('empty cells remain selectable and editable at 25% without mounting thousands of cells', async ({ page }) => {
  await page.goto('/playground/sheet-budget');
  await expect(page.getByRole('gridcell', { name: 'Research', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const grid = page.getByRole('grid');
  await grid.evaluate(element => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: 200, clientX: rect.left + 100, clientY: rect.top + 100, bubbles: true, cancelable: true }));
  });
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('0.25');
  await expect.poll(() => page.getByRole('gridcell').count()).toBeLessThan(1500);
  await page.locator('.grid-scroller').evaluate(element => { element.scrollTop = 0; element.scrollLeft = 0; });
  const empty = (await page.locator('.empty-grid').boundingBox())!;
  const x = empty.x + 100;
  const y = empty.y + 40;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y + 30, { steps: 5 });
  await page.mouse.up();
  const selection = (await page.locator('.empty-selection').boundingBox())!;
  expect(selection.width).toBeGreaterThan(40);
  expect(selection.height).toBeGreaterThan(20);
  await page.mouse.dblclick(x, y);
  const reference = await page.getByLabel('Formula target', { exact: true }).innerText();
  const editor = page.getByRole('textbox', { name: `Edit ${reference}`, exact: true });
  await editor.fill('Previously empty');
  await editor.press('Enter');
  await expect(page.getByRole('gridcell', { name: 'Previously empty', exact: true })).toBeVisible();
  await expect(page.getByText('Modified locally', { exact: true })).toBeVisible();
});
