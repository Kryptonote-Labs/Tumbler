import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { tableClippingFixture } from '../../../packages/word/test/table-clipping-fixture.ts';

const wordUrl = `/@fs${resolve('node_modules/@tumblerjs/word/src/index.ts')}`;

test('exact cells clip DOM text and selection', async ({ page }) => {
  const fixture = tableClippingFixture();
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(fixture) }));
  await page.goto('/playground/word-brief');
  await expect(page.getByText('VISIBLE', { exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const paper = page.locator('.word-page-content').first();
  const original = await paper.screenshot();
  // Hidden text stays in the DOM for document-order keyboard selection, but paints no pixels.
  await paper.locator('[data-paragraph]').evaluateAll(nodes => {
    for (const node of nodes) if (node.textContent?.startsWith('HIDDEN')) (node as HTMLElement).style.visibility = 'hidden';
  });
  expect(Buffer.compare(await paper.screenshot(), original)).toBe(0);
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

});

test('canvas clips exact cells to the same pixels as visible-only text', async ({ page }) => {
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(tableClippingFixture()) }));
  await page.goto('/');
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
  console.log(`Canvas differing RGBA channels: ${differences}`);
  expect(differences).toBe(0);
});

test('pointer selection clamps horizontally overflowing text to its visible cell', async ({ page }) => {
  const { clipTable, clipRow, clipCell, clipParagraph } = await import('../../../packages/word/test/table-clipping-fixture.ts');
  const text = 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const paragraph = clipParagraph(text).replace('<w:pPr>', '<w:pPr><w:ind w:left="-1000" w:right="-1000"/>');
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(tableClippingFixture(clipTable(clipRow(clipCell(paragraph))))) }));
  await page.goto('/playground/word-brief');
  await expect(page.locator('.word-page-content [data-paragraph]').first()).toBeVisible({ timeout: 20000 });
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const cell = await page.locator('[data-cell]').first().boundingBox();
  await page.mouse.click(cell!.x + cell!.width + 100, cell!.y + 5);
  const focus = await page.evaluate(() => ({ text: getSelection()?.focusNode?.textContent, offset: getSelection()?.focusOffset }));
  expect(focus.text).toContain('XXX');
  expect(focus.offset).toBeGreaterThan(0);
  expect(focus.offset).toBeLessThan(focus.text!.length);
});
