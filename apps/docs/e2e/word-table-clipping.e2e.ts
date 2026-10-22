import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { tableClippingFixture } from '../../../packages/word/test/table-clipping-fixture.ts';

const wordUrl = `/@fs${resolve('node_modules/@tumblerjs/word/src/index.ts')}`;

test('exact cells clip DOM text and selection while canvas matches visible-only text', async ({ page }) => {
  const fixture = tableClippingFixture();
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(fixture) }));
  await page.goto('/playground/word-brief');
  await expect(page.getByText('VISIBLE', { exact: true })).toBeVisible();
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const paper = page.locator('.word-page-content').first();
  const original = await paper.screenshot();
  // Hidden text stays in the DOM for document-order keyboard selection, but paints no pixels.
  await paper.locator('[data-paragraph]').evaluateAll(nodes => {
    for (const node of nodes) if (node.textContent?.startsWith('HIDDEN')) (node as HTMLElement).style.visibility = 'hidden';
  });
  expect(await paper.screenshot()).toEqual(original);
  await paper.locator('[data-paragraph]').evaluateAll(nodes => {
    for (const node of nodes) (node as HTMLElement).style.visibility = '';
  });
  const next = await page.getByText('NEXT', { exact: true }).boundingBox();
  await page.mouse.click(next!.x + 12, next!.y + 4, { clickCount: 3 });
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('NEXT');
  const selected = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('[data-paragraph]')];
    const first = spans.find(node => node.textContent === 'VISIBLE')!;
    const hidden = spans.find(node => node.textContent === 'HIDDEN3')!;
    const range = document.createRange();
    range.setStart(first.firstChild!, 0);
    range.setEnd(hidden.firstChild!, 7);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    return getSelection()!.toString();
  });
  expect(selected).toContain('HIDDEN3');

  const differences = await page.evaluate(async wordUrl => {
    const { openWordArtifact, layoutWordDocument, paintWordPage } = await import(wordUrl) as typeof import('../../../packages/word/src/index.ts');
    const bytes = new Uint8Array(await (await fetch('/samples/project-brief.docx')).arrayBuffer());
    const page = layoutWordDocument(openWordArtifact(bytes).document, { measure: text => ({ width: text.length * 5, ascent: 8, descent: 2 }) }).pages[0]!;
    const visibleOnly = { ...page, columns: page.columns.map(column => ({ ...column, tables: column.tables.map(table => ({ ...table, cells: table.cells.map(cell => ({ ...cell, lines: cell.lines.slice(0, 1) })) })) })) };
    const render = (input: typeof page) => {
      const canvas = document.createElement('canvas');
      canvas.width = 500; canvas.height = 600;
      const context = canvas.getContext('2d')!;
      paintWordPage(context, input, { scale: 2 });
      return context.getImageData(0, 0, 500, 600).data;
    };
    const actual = render(page), expected = render(visibleOnly);
    return actual.reduce((count, byte, index) => count + Number(byte !== expected[index]), 0);
  }, wordUrl);
  expect(differences).toBe(0);
});
