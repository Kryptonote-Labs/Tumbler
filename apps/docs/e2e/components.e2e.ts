import { test, expect } from '@playwright/test';

test('component examples render, apply edits, reset, and show their source', async ({ page }) => {
  await page.goto('/components');
  await expect(page.getByRole('heading', { name: 'Components', exact: true })).toBeVisible();
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible();
  await expect(page.locator('.code-block .shiki')).toBeVisible();
  await page.getByRole('button', { name: 'SpreadsheetGrid', exact: true }).click();
  await page.getByRole('gridcell', { name: '85', exact: true }).first().dblclick();
  const cell = page.getByRole('textbox', { name: 'Edit C2', exact: true });
  await cell.fill('100');
  await cell.press('Enter');
  await expect(page.getByRole('gridcell', { name: '1200', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset example' }).click();
  await expect(page.getByRole('gridcell', { name: '1020', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'SpreadsheetFormulaBar', exact: true }).click();
  const formula = page.getByRole('textbox', { name: 'Value or formula for D2', exact: true });
  await formula.fill('=B2*C2*2');
  await formula.press('Enter');
  await expect(page.getByLabel('Calculated value', { exact: true })).toHaveText('2040');
  await page.getByRole('button', { name: 'FormattingToolbar', exact: true }).click();
  const bold = page.getByRole('button', { name: 'Bold', exact: true });
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await bold.click();
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'OoxmlChart', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Quarterly deliveries' })).toBeVisible();
  await page.getByLabel('Chart type').selectOption('pie');
  await expect(page.getByRole('img', { name: 'Quarterly deliveries' }).locator('path')).not.toHaveCount(0);
});

test('components are reachable from navigation and fit a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'Components', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Components', exact: true })).toBeVisible();
  for (const name of ['WordDocumentView', 'FormattingToolbar', 'OoxmlChart']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});


test('pie and doughnut charts centre above their bottom legend at desktop and mobile widths', async ({ page }) => {
  await page.goto('/components');
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'OoxmlChart', exact: true }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const kind of ['pie', 'doughnut']) {
      await page.getByLabel('Chart type').selectOption(kind);
      await expect.poll(async () => page.getByRole('img', { name: 'Quarterly deliveries' }).evaluate(element => {
        const svg = element as SVGSVGElement;
        const paths = [...svg.querySelectorAll('path')].map(path => path.getBBox());
        const left = Math.min(...paths.map(rect => rect.x));
        const right = Math.max(...paths.map(rect => rect.x + rect.width));
        return Math.abs((left + right) / 2 - svg.viewBox.baseVal.width / 2);
      })).toBeLessThan(1);
      await expect.poll(async () => page.getByRole('img', { name: 'Quarterly deliveries' }).evaluate(element => {
        const center = element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2;
        const rows = new Map<number, { left: number; right: number }>();
        for (const item of element.querySelectorAll('.pie-legend > g')) {
          const rect = item.getBoundingClientRect();
          const row = rows.get(Math.round(rect.top));
          rows.set(Math.round(rect.top), { left: Math.min(row?.left ?? Infinity, rect.left), right: Math.max(row?.right ?? -Infinity, rect.right) });
        }
        return Math.max(...[...rows.values()].map(row => Math.abs((row.left + row.right) / 2 - center)));
      })).toBeLessThan(1);
      const separation = await page.getByRole('img', { name: 'Quarterly deliveries' }).evaluate(element => {
        const bottom = Math.max(...[...element.querySelectorAll('path')].map(path => path.getBoundingClientRect().bottom));
        const legendTop = Math.min(...[...element.querySelectorAll('.pie-legend > g')].map(group => group.getBoundingClientRect().top));
        return legendTop - bottom;
      });
      expect(separation).toBeGreaterThan(0);
    }
  }
});
