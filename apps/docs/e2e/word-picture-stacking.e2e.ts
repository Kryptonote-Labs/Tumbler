import { test, expect } from '@playwright/test';
import { pictureInkStackFixture } from '../../../packages/word/test/picture-ink-fixture.ts';

const wordUrl = '/@fs' + new URL('../../../packages/word/src/index.ts', import.meta.url).pathname;

test('composited ink remains visible above three ranked front pictures in the mounted DOM', async ({ page }, info) => {
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(pictureInkStackFixture()) }));
  await page.goto('/playground/word-brief');
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.75');
  const host = page.locator('[data-word-ink-page-host]').first();
  await expect(host.locator('[data-word-drawing]')).toHaveCount(4);
  await host.locator('img').evaluateAll(async images => {
    await Promise.all(images.map(async image => { if (image instanceof HTMLImageElement) { image.loading = 'eager'; await image.decode(); } }));
  });
  // Both the original canvas layer and PR126's tiled layer must be finished before sampling.
  await expect.poll(() => host.locator('[data-word-ink-page]').evaluate(element => {
    if (!(element instanceof HTMLCanvasElement)) return element.hasAttribute('data-word-ink-ready');
    const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    return data.some((value, i) => i % 4 === 3 && value > 0);
  })).toBe(true);
  const bounds = await host.boundingBox();
  if (!bounds) throw Error('Missing page bounds');
  const shot = await page.screenshot({ path: info.outputPath('picture-ink-stack.png'), clip: { x: bounds.x + 96, y: bounds.y + 76, width: 32, height: 32 } });
  const pixels = await page.evaluate(async ({ png, wordUrl }) => {
    const word = await import(wordUrl) as typeof import('../../../packages/word/src/index.ts');
    const artifact = word.openWordArtifact(new Uint8Array(await (await fetch('/samples/project-brief.docx')).arrayBuffer()));
    const model = word.layoutWordDocument(artifact.document, { measure: () => ({ width: 5, ascent: 8, descent: 2 }) }).pages[0]!;
    const decoded = new Map<import('../../../packages/word/src/index.ts').WordImageDrawing, HTMLImageElement>();
    for (const drawing of word.wordPageImages(model)) {
      if (drawing.inkProjection) continue;
      const image = new Image(); image.src = URL.createObjectURL(new Blob([new Uint8Array(drawing.bytes)], { type: drawing.contentType })); await image.decode(); decoded.set(drawing, image);
    }
    const canvas = document.createElement('canvas'); canvas.width = model.width; canvas.height = model.height;
    const ctx = canvas.getContext('2d')!;
    word.paintWordPage(ctx, model, { scale: 1, image: drawing => decoded.get(drawing) });
    const screenshot = new Image(); screenshot.src = `data:image/png;base64,${png}`; await screenshot.decode();
    const dom = document.createElement('canvas'); dom.width = screenshot.width; dom.height = screenshot.height;
    const dc = dom.getContext('2d')!; dc.drawImage(screenshot, 0, 0);
    const countCyan = (rgba: Uint8ClampedArray) => { let count = 0; for (let i = 0; i < rgba.length; i += 4) if (rgba[i] === 0 && rgba[i + 1] === 255 && rgba[i + 2] === 255 && rgba[i + 3] === 255) count++; return count; };
    const result = { canvasCyan: countCyan(ctx.getImageData(96, 76, 32, 32).data), domCyan: countCyan(dc.getImageData(0, 0, dom.width, dom.height).data) };
    decoded.forEach(image => URL.revokeObjectURL(image.src));
    return result;
  }, { png: shot.toString('base64'), wordUrl });
  console.log(JSON.stringify({ pictureInkStack: pixels }));
  expect(pixels.canvasCyan).toBeGreaterThan(0);
  expect(pixels.domCyan).toBeGreaterThan(0);
});
