import { test, expect } from '@playwright/test';

test('changelog opens dated historical releases and marks partial publications', async ({ page }) => {
  await page.goto('/changelog');
  await expect(page.getByRole('heading', { name: 'Changelog', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /^0\.1\.0-alpha\.26\b/ })).toBeVisible();
  await page.getByRole('link', { name: /^0\.1\.0-alpha\.0\b/ }).click();
  await expect(page.getByRole('heading', { name: '0.1.0-alpha.0', exact: true })).toBeVisible();
  await expect(page.locator('article time')).toHaveText('3 August 2026');
  await expect(page.getByRole('link', { name: 'Registry publication and package metadata' })).toHaveAttribute('href', 'https://registry.npmjs.org/@tumblerjs/opc/0.1.0-alpha.0');
  await page.getByRole('link', { name: 'Back to changelog' }).click();
  await page.getByRole('link', { name: /^0\.1\.0-alpha\.2\b/ }).click();
  await expect(page.getByText('Partial publication', { exact: false })).toBeVisible();
});
