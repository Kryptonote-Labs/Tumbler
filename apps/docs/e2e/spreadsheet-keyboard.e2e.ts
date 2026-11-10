import { test, expect } from '@playwright/test';

for (const [key, target] of [
  ['ArrowRight', 'D2'], ['ArrowDown', 'C3'], ['ArrowLeft', 'B2'], ['ArrowUp', 'C1'],
] as const) {
  test(`${key} commits a typed spreadsheet value and selects the adjacent cell`, async ({ page }) => {
    await page.goto('/playground/sheet-budget');
    await expect(page.getByRole('gridcell', { name: '85', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('[data-reference="C2"]').click();
    await page.keyboard.type('123');
    await page.keyboard.press(key);
    await expect(page.locator('.cell.active')).toHaveAttribute('data-reference', target);
    await expect(page.locator('[data-reference="C2"]')).toHaveText('123');
    await expect(page.getByRole('grid')).toBeFocused();
    expect(await page.locator('.grid-scroller').evaluate(element => element.scrollTop)).toBe(0);
  });
}

test('F2 keeps arrows inside the cell text and blocks vertical page scrolling', async ({ page }) => {
  await page.goto('/playground/sheet-budget');
  await expect(page.getByRole('gridcell', { name: '85', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('[data-reference="C2"]').click();
  await page.keyboard.press('F2');
  const editor = page.getByLabel('Edit C2', { exact: true });
  await editor.press('End');
  await editor.press('ArrowLeft');
  await page.keyboard.type('x');
  await editor.press('ArrowDown');
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('8x5');
  expect(await page.locator('.grid-scroller').evaluate(element => element.scrollTop)).toBe(0);
  await editor.press('Escape');
  await expect(page.locator('[data-reference="C2"]')).toHaveText('85');
});

test('Backspace starts a blank edit in the first selected cell and preserves its neighbors', async ({ page }) => {
  await page.goto('/playground/sheet-budget');
  await expect(page.getByRole('gridcell', { name: '85', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('[data-reference="C3"]').click();
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Backspace');
  const editor = page.getByLabel('Edit C3', { exact: true });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('');
  await editor.press('Escape');
  await expect(page.locator('[data-reference="C3"]')).toHaveText('95');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('100');
  await editor.press('Enter');
  await expect(page.locator('[data-reference="C3"]')).toHaveText('100');
  await expect(page.locator('[data-reference="C2"]')).toHaveText('85');
});
