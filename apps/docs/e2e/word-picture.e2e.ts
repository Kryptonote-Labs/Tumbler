import { test, expect } from '@playwright/test';
import { pictureFixture } from '../../../packages/word/test/picture-fixture.ts';

const wordUrl = '/@fs' + new URL('../../../packages/word/src/index.ts', import.meta.url).pathname;
const colours = { red: [255, 0, 0, 255], green: [0, 255, 0, 255], blue: [0, 0, 255, 255], yellow: [255, 255, 0, 255], white: [255, 255, 255, 255] };
const cases = [
  { name: 'left crop', crop: 'l="50000"', transform: '', expected: ['green', 'green', 'yellow', 'yellow'] },
  { name: 'horizontal flip after crop', crop: 't="50000"', transform: 'flipH="1"', expected: ['yellow', 'blue', 'yellow', 'blue'] },
  { name: 'vertical flip', crop: '', transform: 'flipV="true"', expected: ['blue', 'yellow', 'red', 'green'] },
  { name: 'clockwise rotation after reflection', crop: '', transform: 'rot="5400000" flipH="1"', expected: ['yellow', 'green', 'blue', 'red'] },
  { name: 'negative crop', crop: 'l="-100000"', transform: '', expected: ['white', 'green', 'white', 'yellow'] },
] as const;

for (const fixture of cases) test(`DOM and canvas pixels: ${fixture.name}`, async ({ page }) => {
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(pictureFixture(fixture)) }));
  await page.goto('/playground/word-brief');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  const drawing = page.locator('[data-word-drawing]').first();
  await expect(drawing).toBeVisible();
  await drawing.locator('img').evaluate(async (img: HTMLImageElement) => { img.loading = 'eager'; await img.decode(); });
  // Sample well inside each quadrant, including the rotated non-square frame.
  const bounds = await drawing.boundingBox();
  if (!bounds) throw new Error('No drawing bounds');
  const rotated = fixture.transform.includes('rot=');
  const sampleWidth = rotated ? bounds.height : bounds.width;
  const sampleHeight = rotated ? bounds.width : bounds.height;
  const clip = { x: bounds.x + (bounds.width - sampleWidth) / 2, y: bounds.y + (bounds.height - sampleHeight) / 2, width: sampleWidth, height: sampleHeight };
  const screenshot = await page.screenshot({ clip });
  const result = await page.evaluate(async ({ wordUrl, png, rotated }) => {
    const { openWordArtifact, layoutWordDocument, paintWordPage } = await import(wordUrl) as typeof import('../../../packages/word/src/index.ts');
    const artifact = openWordArtifact(new Uint8Array(await (await fetch('/samples/project-brief.docx')).arrayBuffer()));
    const model = layoutWordDocument(artifact.document, { measure: () => ({ width: 5, ascent: 8, descent: 2 }) }).pages[0]!;
    const fragment = model.columns.flatMap(c => c.lines).flatMap(l => l.fragments).find(f => f.drawing)!;
    const image = new Image();
    image.src = URL.createObjectURL(new Blob([Uint8Array.from(fragment.drawing!.kind === 'image' ? fragment.drawing!.bytes : []).buffer], { type: 'image/svg+xml' }));
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = model.width; canvas.height = model.height;
    const ctx = canvas.getContext('2d')!;
    paintWordPage(ctx, model, { scale: 1, image: () => image });
    const shot = new Image(); shot.src = `data:image/png;base64,${png}`; await shot.decode();
    const dom = document.createElement('canvas'); dom.width = shot.width; dom.height = shot.height;
    const dc = dom.getContext('2d')!; dc.drawImage(shot, 0, 0);
    const width = rotated ? fragment.height : fragment.width, height = rotated ? fragment.width : fragment.height;
    const x = fragment.x + (fragment.width - width) / 2, y = fragment.y + (fragment.height - height) / 2;
    const points = [[.25, .25], [.75, .25], [.25, .75], [.75, .75]];
    return {
      dom: points.map(([px, py]) => Array.from(dc.getImageData(Math.floor(px! * dom.width), Math.floor(py! * dom.height), 1, 1).data)),
      canvas: points.map(([px, py]) => Array.from(ctx.getImageData(Math.floor(x + px! * width), Math.floor(y + py! * height), 1, 1).data)),
    };
  }, { wordUrl, png: screenshot.toString('base64'), rotated });
  const expected = fixture.expected.map(c => colours[c]);
  expect(result.canvas).toEqual(expected);
  expect(result.dom).toEqual(expected);
});

test('DOM floating drawings use unsigned relativeHeight instead of source order', async ({ page }) => {
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(pictureFixture({ anchors: [4294967295, 2147483648, 0] })) }));
  await page.goto('/playground/word-brief');
  const images = page.locator('[data-word-drawing]');
  await expect(images).toHaveCount(3);
  const result = await images.first().evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit?.closest('[data-word-drawing]')?.getAttribute('data-word-drawing');
  });
  expect(result).toBe(await images.first().getAttribute('data-word-drawing'));
});
