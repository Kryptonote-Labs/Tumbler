import { resolve } from 'node:path';
import { tableDrawingOptOutFixture } from '../../../packages/word/test/table-drawing-opt-out-fixture.ts';
import { expect, test, type Page } from '@playwright/test';
import { createWordArtifact, type WordContentBlock } from '@tumblerjs/word';

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64'));
const paragraph = { spacingBeforeTwips: 0, spacingAfterTwips: 0, lineSpacing: { rule: 'exact', value: 200 } } as const;
const margins = { topTwips: 0, endTwips: 0, bottomTwips: 0, startTwips: 0 };

async function openTable(page: Page, blocks: WordContentBlock[], heightTwips: number) {
  const fixture = createWordArtifact({ page: { width: 400, height: 400, margin: 80 }, blocks: [{ kind: 'table', rowFormats: [{ heightTwips, heightRule: 'exact' }], rows: [[{ format: { margins }, blocks }]] }] });
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(fixture.bytes()) }));
  await page.goto('/playground/word-brief');
  await expect(page.locator('[data-word-drawing]')).toBeVisible({ timeout: 20000 });
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
}

for (const placement of ['front', 'behind'] as const) {
  test(`${placement} drawings retain their layer across paragraphs in the same clipped cell`, async ({ page }) => {
    const text: WordContentBlock = { kind: 'paragraph', paragraph, runs: [{ text: 'OVERLAPPING TEXT' }] };
    const drawing: WordContentBlock = { kind: 'paragraph', paragraph, runs: [{ text: '\ufffc', image: { bytes: png, contentType: 'image/png', width: 150, height: 40, layout: placement, x: 0, y: placement === 'front' ? 0 : -10 } }] };
    await openTable(page, placement === 'front' ? [drawing, text] : [text, drawing], 800);
    const order = await page.getByText('OVERLAPPING TEXT', { exact: true }).evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const hits = document.elementsFromPoint(bounds.x + 5, bounds.y + bounds.height / 2);
      return { text: hits.indexOf(element), drawing: hits.findIndex(hit => hit.matches('[data-word-drawing] .content')) };
    });
    expect(order.text).toBeGreaterThanOrEqual(0);
    expect(order.drawing).toBeGreaterThanOrEqual(0);
    expect(order.drawing < order.text).toBe(placement === 'front');
  });
}

test('drawing controls stay interactive outside the cell while its content stays clipped', async ({ page }) => {
  await openTable(page, [{ kind: 'paragraph', paragraph, runs: [{ text: '\ufffc', image: { bytes: png, contentType: 'image/png', width: 50, height: 40, layout: 'front', x: 120, y: 0, alt: 'Clipped drawing' } }] }], 200);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const content = page.getByRole('button', { name: 'Select Clipped drawing', exact: true });
  const bounds = (await content.boundingBox())!;
  await page.mouse.click(bounds.x + 5, bounds.y + 5);
  const move = page.getByRole('button', { name: 'Move drawing', exact: true });
  await expect(move).toBeVisible();
  expect(await move.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return document.elementsFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2).includes(element);
  })).toBe(true);
  expect(await content.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return document.elementsFromPoint(rect.x + 5, rect.bottom - 2).includes(element);
  })).toBe(false);
  await page.getByLabel('Drawing layout', { exact: true }).selectOption('inline');
  await expect(page.getByLabel('Drawing layout', { exact: true })).toHaveValue('inline');
});

for (const value of ['0', '1']) {
  test(`imported layoutInCell=${value} controls outside-cell DOM and canvas pixels`, async ({ page }) => {
    const bytes = tableDrawingOptOutFixture(value).bytes();
    await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(bytes) }));
    await page.goto('/playground/word-brief');
    const content = page.locator('[data-word-drawing] .content');
    await expect(content).toBeAttached({ timeout: 20000 });
    const visible = await content.evaluate(element => {
      const box = element.getBoundingClientRect();
      return document.elementsFromPoint(box.x + 5, box.y + 5).includes(element);
    });
    expect(visible).toBe(value === '0');
    const painted = await page.evaluate(async ({ bytes, url }) => {
      const { openWordArtifact, layoutWordDocument, paintWordPage } = await import(url) as typeof import('../../../packages/word/src/index.ts');
      const input = layoutWordDocument(openWordArtifact(new Uint8Array(bytes)).document, { measure: text => ({ width: text.length * 5, ascent: 8, descent: 2 }) }).pages[0]!;
      const image = document.createElement('canvas'); image.width = 20; image.height = 20;
      const brush = image.getContext('2d')!; brush.fillStyle = '#ff0000'; brush.fillRect(0, 0, 20, 20);
      const canvas = document.createElement('canvas'); canvas.width = input.width; canvas.height = input.height;
      const context = canvas.getContext('2d')!;
      paintWordPage(context, input, { scale: 1, image: () => image });
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] === 255 && pixels[i + 1] === 0 && pixels[i + 2] === 0) red++;
      return red;
    }, { bytes: [...bytes], url: `/@fs${resolve('node_modules/@tumblerjs/word/src/index.ts')}` });
    console.log(`layoutInCell=${value}: ${painted} visible drawing pixels`);
    expect(painted).toBe(value === '0' ? 400 : 0);
  });
}

for (const story of ['header', 'footer'] as const) {
  test(`${story} table front anchors paint above later inline drawings`, async ({ page }) => {
    const { buildWordDocumentFixture } = await import('../../../packages/word/test/document-fixture.ts');
    const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const shape = { preset: 'rect' as const, width: 60, height: 30, fill: '#ff0000', outline: 'none' as const, outlineWidth: 0 };
    const generated = createWordArtifact({ blocks: [{ kind: 'table', rowFormats: [{ heightTwips: 1600, heightRule: 'exact' }], rows: [[{ format: { margins }, blocks: [
      { kind: 'paragraph', paragraph, runs: [{ text: '\ufffc', shape: { ...shape, layout: 'front', x: 0, y: 0, horizontalRelativeTo: 'column', verticalRelativeTo: 'paragraph' } }] },
      { kind: 'paragraph', paragraph, runs: [{ text: '\ufffc', shape: { ...shape, fill: '#0000ff', layout: 'inline' } }] },
    ] }]] }] }).document.source.source;
    const table = generated.slice(generated.indexOf('<w:tbl>'), generated.indexOf('</w:tbl>') + '</w:tbl>'.length);
    const root = generated.slice(generated.indexOf('<w:document'), generated.indexOf('><w:body>') + 1).replace('w:document', story === 'header' ? 'w:hdr' : 'w:ftr');
    const bytes = buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="${w}" xmlns:r="${r}"><w:body><w:p/><w:sectPr><w:${story}Reference w:type="default" r:id="story"/><w:pgSz w:w="8000" w:h="8000"/><w:pgMar w:top="2400" w:right="1600" w:bottom="2400" w:left="1600" w:header="200" w:footer="200"/></w:sectPr></w:body></w:document>`,
      relationships: [{ id: 'story', type: `${r}/${story}`, target: `${story}.xml` }],
      parts: [{ itemName: `word/${story}.xml`, contentType: `application/vnd.openxmlformats-officedocument.wordprocessingml.${story}+xml`, xml: `${root}${table}</${story === 'header' ? 'w:hdr' : 'w:ftr'}>` }],
    });
    await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(bytes) }));
    await page.goto('/playground/word-brief');
    const drawings = page.locator('.word-page-content .shape-drawing');
    await expect(drawings).toHaveCount(2, { timeout: 20000 });
    const order = await drawings.first().evaluate((front, inline) => {
      if (!inline) throw Error('Missing inline drawing');
      const a = front.getBoundingClientRect(), b = inline.getBoundingClientRect();
      const left = Math.max(a.left, b.left), top = Math.max(a.top, b.top);
      const right = Math.min(a.right, b.right), bottom = Math.min(a.bottom, b.bottom);
      if (right <= left || bottom <= top) throw Error('Fixture drawings must overlap');
      const hits = document.elementsFromPoint((left + right) / 2, (top + bottom) / 2);
      return { front: hits.indexOf(front), inline: hits.indexOf(inline) };
    }, await drawings.last().elementHandle());
    expect(order.front).toBeGreaterThanOrEqual(0);
    expect(order.inline).toBeGreaterThanOrEqual(0);
    expect(order.front).toBeLessThan(order.inline);
  });
}
