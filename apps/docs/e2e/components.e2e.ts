import { test, expect, type Page } from '@playwright/test';

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('a component page runs its example beside the source it renders', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Panes pair once the example column reaches 1060px, as on a 1440px screen.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/components/word-document-view');
  await expect(page.getByRole('heading', { name: 'WordDocumentView', exact: true })).toBeVisible();
  // The first sample parse can be slow on a cold dev server.
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible({ timeout: 20_000 });
  const source = page.locator('.live-source');
  await expect(source.getByText('WordPreview.svelte', { exact: true })).toBeVisible();
  await expect(source.getByRole('button', { name: 'Copy code' })).toBeVisible();
  // Desktop pairs preview and source in one row.
  const [preview, code] = await Promise.all([page.locator('.live-preview').boundingBox(), source.boundingBox()]);
  expect(code!.x).toBeGreaterThan(preview!.x + preview!.width - 2);
  expect(code!.y).toBeCloseTo(preview!.y, 0);
  expect(errors).toEqual([]);
});

test('SpreadsheetGrid example edits, recalculates and resets', async ({ page }) => {
  await page.goto('/components/spreadsheet-grid');
  await page.waitForLoadState('networkidle');
  // Default 20px rows must contain their full text line box without clipping its top.
  const lineBox = await page.locator('[data-reference="C2"]').evaluate(cell => {
    const bounds = cell.getBoundingClientRect();
    const text = cell.querySelector('span')!.getBoundingClientRect();
    return { top: text.top - bounds.top, bottom: text.bottom - bounds.top, height: bounds.height };
  });
  expect(lineBox.top).toBeGreaterThanOrEqual(0);
  expect(lineBox.bottom).toBeLessThanOrEqual(lineBox.height);
  await page.getByRole('gridcell', { name: '85', exact: true }).first().dblclick();
  const cell = page.getByLabel('Edit C2', { exact: true });
  await cell.fill('100');
  await cell.press('Enter');
  await expect(page.getByRole('gridcell', { name: '1200', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset example' }).click();
  await expect(page.getByRole('gridcell', { name: '1020', exact: true })).toBeVisible();
});

test('SpreadsheetFormulaBar example applies formulas', async ({ page }) => {
  await page.goto('/components/spreadsheet-formula-bar');
  await page.waitForLoadState('networkidle');
  const formula = page.getByLabel('Value or formula for D2', { exact: true });
  await formula.fill('=B2*C2*2');
  await formula.press('Enter');
  await expect(page.getByLabel('Calculated value', { exact: true })).toHaveText('2040');
});

test('FormattingToolbar example reflects and applies formatting', async ({ page }) => {
  await page.goto('/components/formatting-toolbar');
  await page.waitForLoadState('networkidle');
  const bold = page.getByRole('button', { name: 'Bold', exact: true });
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await bold.click();
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
});

test('the spreadsheet guide keeps edits across worksheet switches', async ({ page }) => {
  await page.goto('/docs/spreadsheet-viewer');
  await page.waitForLoadState('networkidle');
  const example = page.locator('[data-example="workbook-sheets"]');
  await example.getByRole('gridcell', { name: '85', exact: true }).first().dblclick();
  const cell = example.getByLabel('Edit C2', { exact: true });
  await cell.fill('100');
  await cell.press('Enter');
  await example.getByRole('tab', { name: 'Notes' }).click();
  await expect(example.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
  await example.getByRole('tab', { name: 'Budget' }).click();
  await expect(example.getByRole('gridcell', { name: '1200', exact: true })).toBeVisible();
});

test('components are reachable from navigation and stack on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'Components', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Components', exact: true })).toBeVisible();
  for (const slug of ['word-document-view', 'formatting-toolbar', 'ooxml-chart']) {
    await page.goto(`/components/${slug}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.live-source')).toBeVisible();
    const [preview, source] = await Promise.all([page.locator('.live-preview').boundingBox(), page.locator('.live-source').boundingBox()]);
    expect(source!.y).toBeGreaterThanOrEqual(preview!.y + preview!.height - 1);
    await expect.poll(() => noHorizontalScroll(page)).toBe(true);
  }
});

test('pie and doughnut charts centre above their bottom legend at desktop and mobile widths', async ({ page }) => {
  await page.goto('/components/ooxml-chart');
  await page.waitForLoadState('networkidle');
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
        for (const item of element.querySelectorAll('.chart-legend > .chart-legend-entry')) {
          const rect = item.getBoundingClientRect();
          const row = rows.get(Math.round(rect.top));
          rows.set(Math.round(rect.top), { left: Math.min(row?.left ?? Infinity, rect.left), right: Math.max(row?.right ?? -Infinity, rect.right) });
        }
        return Math.max(...[...rows.values()].map(row => Math.abs((row.left + row.right) / 2 - center)));
      })).toBeLessThan(1);
      const separation = await page.getByRole('img', { name: 'Quarterly deliveries' }).evaluate(element => {
        const bottom = Math.max(...[...element.querySelectorAll('path')].map(path => path.getBoundingClientRect().bottom));
        const legendTop = Math.min(...[...element.querySelectorAll('.chart-legend > .chart-legend-entry')].map(group => group.getBoundingClientRect().top));
        return legendTop - bottom;
      });
      expect(separation).toBeGreaterThan(0);
    }
  }
});
