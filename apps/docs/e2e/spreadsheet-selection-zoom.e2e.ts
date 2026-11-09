import { test, expect } from '@playwright/test';

for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
  test(`trackpad pinch over the ${edge} selection edge zooms only the sheet`, async ({ page }) => {
    await page.goto('/playground/sheet-budget');
    await expect(page.getByRole('gridcell', { name: '85', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const start = (await page.locator('[data-reference="C2"]').boundingBox())!;
    const end = (await page.locator('[data-reference="E5"]').boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
    await page.mouse.up();
    const rect = (await page.locator('.selection-outline').boundingBox())!;
    const x = edge === 'left' ? rect.x + 0.5 : edge === 'right' ? rect.x + rect.width - 0.5 : rect.x + rect.width / 2;
    const y = edge === 'top' ? rect.y + 0.5 : edge === 'bottom' ? rect.y + rect.height - 0.5 : rect.y + rect.height / 2;
    const before = await page.evaluate(() => ({ dpr: devicePixelRatio, visual: visualViewport!.scale }));
    const session = await page.context().newCDPSession(page);
    await session.send('Input.synthesizePinchGesture', { x, y, scaleFactor: 1.1, relativeSpeed: 1000, gestureSourceType: 'mouse' });
    await expect.poll(() => page.getByRole('grid').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).a)).toBeCloseTo(1.1, 2);
    expect(await page.evaluate(() => ({ dpr: devicePixelRatio, visual: visualViewport!.scale }))).toEqual(before);
    await session.detach();
  });
}
