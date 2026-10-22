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
  // Hiding selected text can shorten the highlight within the visible first line.
  // Pixels below that cell must stay identical, including the next row's text.
  const paperBox = (await paper.boundingBox())!;
  const cellBox = (await page.locator('[data-cell]').first().boundingBox())!;
  const belowY = Math.ceil(cellBox.y + cellBox.height);
  const belowCell = { x: paperBox.x, y: belowY, width: paperBox.width, height: paperBox.y + paperBox.height - belowY };
  const highlighted = await page.screenshot({ clip: belowCell });
  await paper.locator('[data-paragraph]').evaluateAll(nodes => {
    for (const node of nodes) if (node.textContent?.startsWith('HIDDEN')) (node as HTMLElement).style.visibility = 'hidden';
  });
  expect(Buffer.compare(await page.screenshot({ clip: belowCell }), highlighted)).toBe(0);

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

for (const placement of ['inline', 'anchor'] as const) {
  test(`native ${placement} ink writes no pixels outside an exact cell`, async ({ page }) => {
    const { inkFixture } = await import('../../../packages/word/test/ink-fixture.ts');
    const { officeInk } = await import('../../../packages/ink/test/fixture.ts');
    const { source } = inkFixture(false, false, officeInk({ brush: '<brushProperty name="width" value="0.1" units="cm"/><brushProperty name="height" value="0.1" units="cm"/><brushProperty name="rasterOp" value="xOrPen"/><brushProperty name="color" value="#ffffff"/>' }));
    await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(source.bytes()) }));
    await page.goto('/');
    const counts = await page.evaluate(async ({ wordUrl, placement }) => {
      const { openWordArtifact, layoutWordDocument, paintWordPage } = await import(wordUrl) as typeof import('../../../packages/word/src/index.ts');
      const bytes = new Uint8Array(await (await fetch('/samples/project-brief.docx')).arrayBuffer());
      const original = layoutWordDocument(openWordArtifact(bytes).document, { measure: text => ({ width: text.length * 5, ascent: 8, descent: 2 }) }).pages[0]!;
      const column = original.columns[0]!;
      const fragment = column.lines.flatMap(line => line.fragments).find(fragment => fragment.drawing)!;
      const clip = { x: fragment.x, y: fragment.y, width: fragment.width, height: 10 };
      const lines = column.lines.map(line => ({ ...line, fragments: line.fragments.map(fragment => fragment.drawing ? { ...fragment, drawing: { ...fragment.drawing, placement } } : fragment) }));
      const input = { ...original, columns: [{ ...column, lines: [], tables: [{ tableElementId: 1, ...clip, cells: [{ cellElementId: 2, continuationElementIds: [], row: 0, column: 0, rowSpan: 1, columnSpan: 1, ...clip, lines, tables: [] }] }] }] };
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(original.width * 2); canvas.height = Math.ceil(original.height * 2);
      const context = canvas.getContext('2d')!;
      paintWordPage(context, input, { scale: 2 });
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let inside = 0, outside = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset] === 255 && pixels[offset + 1] === 255 && pixels[offset + 2] === 255) continue;
        if (x >= Math.ceil(clip.x * 2) && x < Math.floor((clip.x + clip.width) * 2) && y >= Math.ceil(clip.y * 2) && y < Math.floor((clip.y + clip.height) * 2)) inside++;
        else outside++;
      }
      return { inside, outside };
    }, { wordUrl, placement });
    console.log(`${placement} ink pixels: ${JSON.stringify(counts)}`);
    expect(counts.inside).toBeGreaterThan(0);
    expect(counts.outside).toBe(0);
  });
}

test('floating images keep their cell clip in the separate canvas paint pass', async ({ page }) => {
  await page.goto('/');
  const counts = await page.evaluate(async wordUrl => {
    const { createWordArtifact, openWordArtifact, layoutWordDocument, paintWordPage } = await import(wordUrl) as typeof import('../../../packages/word/src/index.ts');
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='), char => char.charCodeAt(0));
    const bytes = createWordArtifact({ blocks: [{ kind: 'table', rowFormats: [{ heightTwips: 200, heightRule: 'exact' }], rows: [[{ blocks: [{ kind: 'paragraph', runs: [{ text: '\ufffc', image: { bytes: png, contentType: 'image/png', width: 20, height: 40, layout: 'front', x: 0, y: 0 } }] }] }]] }] }).bytes();
    const input = layoutWordDocument(openWordArtifact(bytes).document, { measure: text => ({ width: text.length * 5, ascent: 8, descent: 2 }) }).pages[0]!;
    const clip = input.columns[0]!.tables[0]!.cells[0]!;
    const image = document.createElement('canvas'); image.width = 20; image.height = 40;
    const brush = image.getContext('2d')!; brush.fillStyle = '#ff0000'; brush.fillRect(0, 0, 20, 40);
    const canvas = document.createElement('canvas'); canvas.width = input.width; canvas.height = input.height;
    const context = canvas.getContext('2d')!;
    paintWordPage(context, input, { scale: 1, image: () => image });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let inside = 0, outside = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (pixels[i] !== 255 || pixels[i + 1] !== 0 || pixels[i + 2] !== 0) continue;
      if (x >= clip.x && x < clip.x + clip.width && y >= clip.y && y < clip.y + clip.height) inside++;
      else outside++;
    }
    return { inside, outside };
  }, wordUrl);
  console.log(`Floating image pixels: ${JSON.stringify(counts)}`);
  expect(counts.inside).toBeGreaterThan(0);
  expect(counts.outside).toBe(0);
});
