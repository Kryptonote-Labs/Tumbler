import { test, expect } from '@playwright/test';
import { inkFixture } from '../../../packages/word/test/ink-fixture.ts';
import { officeInk } from '../../../packages/ink/test/fixture.ts';

const source = inkFixture(false, false, officeInk({ brush: '<brushProperty name="width" value="0.05" units="cm"/><brushProperty name="height" value="0.05" units="cm"/><brushProperty name="rasterOp" value="xOrPen"/><brushProperty name="color" value="#ffffff"/>' })).source;
const drawing = [...source.document.drawings.values()][0]!;
const bytes = [...source.updateDrawing({ elementId: drawing.elementId, widthPoints: 20, heightPoints: 20, layout: 'front', xPoints: 100, yPoints: 100 }).bytes()];

test('bounded overlays match full-page ROP pixels, survive unrelated decode failures and cancel', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async bytes => {
    const url = '/src/lib/test-fixtures/ink-overlay.ts';
    const api: typeof import('../src/lib/test-fixtures/ink-overlay.ts') = await import(/* @vite-ignore */ url);
    const model = api.fixture(bytes);
    const display = await api.show(model, 1);
    const before = getComputedStyle(display.mounted[0]!.target.querySelector('img')!).visibility;
    for (let i = 0; i < 1000 && !display.mounted[0]!.target.querySelector('[data-word-ink-ready]') && !display.errors.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
    const target = display.mounted[0]!.target;
    const ready = !!target.querySelector('[data-word-ink-ready]');
    const after = getComputedStyle(target.querySelector('img')!).visibility;
    const plan = api.wordInkTiles(model, 4 / 3);
    const reference = api.baseline(model, plan.scale);
    let differences = 0;
    const canvases = [...target.querySelectorAll('canvas')];
    for (const [index, canvas] of canvases.entries()) {
      const tile = plan.tiles[index]!;
      const actual = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      const expected = reference.getContext('2d')!.getImageData(tile.x, tile.y, tile.width, tile.height).data;
      for (let i = 0; i < actual.length; i += 4) if (actual[i + 3] !== expected[i + 3] || actual[i + 3] && (actual[i] !== expected[i] || actual[i + 1] !== expected[i + 1] || actual[i + 2] !== expected[i + 2])) differences++;
    }
    const pixels = canvases.reduce((sum, canvas) => sum + canvas.width * canvas.height, 0);
    const errors = display.errors.slice();
    await display.dispose();
    const large = { ...model, columns: model.columns.map(column => ({ ...column, lines: column.lines.map(line => ({ ...line, fragments: line.fragments.map(fragment => fragment.drawing ? { ...fragment, width: 120, height: 120 } : fragment) })) })) };
    const cancelled = await api.show(large, 3);
    while (!cancelled.mounted[0]!.target.querySelector('canvas') && !cancelled.errors.length) await new Promise(resolve => setTimeout(resolve, 0));
    const cancelledBetweenTiles = !cancelled.mounted[0]!.target.querySelector('[data-word-ink-ready]');
    await cancelled.dispose();
    await new Promise(resolve => setTimeout(resolve, 30));
    return { before, after, ready, differences, pixels, errors, cancelledBetweenTiles, remaining: document.querySelectorAll('[data-word-ink-page]').length };
  }, bytes);
  expect(result).toMatchObject({ before: 'visible', after: 'hidden', ready: true, differences: 0, errors: [], cancelledBetweenTiles: true, remaining: 0 });
  expect(result.pixels).toBeLessThan(4096);
});

test('decode failure only blocks intersecting tiles and preserves the fallback', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async bytes => {
    const url = '/src/lib/test-fixtures/ink-overlay.ts';
    const api: typeof import('../src/lib/test-fixtures/ink-overlay.ts') = await import(/* @vite-ignore */ url);
    const results = [];
    for (const overlap of [false, true]) {
      const display = await api.show(api.withBrokenImage(api.fixture(bytes), overlap), 1);
      const target = display.mounted[0]!.target;
      for (let i = 0; i < 1000 && !target.querySelector('[data-word-ink-ready]') && !display.errors.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
      results.push({ overlap, ready: !!target.querySelector('[data-word-ink-ready]'), visibility: getComputedStyle(target.querySelector('img')!).visibility, errors: display.errors.length });
      await display.dispose();
    }
    return results;
  }, bytes);
  expect(result).toEqual([{ overlap: false, ready: true, visibility: 'hidden', errors: 0 }, { overlap: true, ready: false, visibility: 'visible', errors: 1 }]);
});

test('ink allocation benchmark', async ({ browser }) => {
  test.skip(!process.env.INK_BENCHMARK);
  test.setTimeout(600_000);
  const rows = [];
  for (const dpr of [1, 2]) {
    const context = await browser.newContext({ deviceScaleFactor: dpr });
    const page = await context.newPage();
    await page.goto('/');
    for (const zoom of [1, 3]) for (const count of [1, 4]) {
      const samples = await page.evaluate(async ({ bytes, zoom, count }) => {
        const url = '/src/lib/test-fixtures/ink-overlay.ts', meterUrl = '/src/lib/test-fixtures/ink-meter.ts';
        const api: typeof import('../src/lib/test-fixtures/ink-overlay.ts') = await import(/* @vite-ignore */ url);
        const { inkMeter }: typeof import('../src/lib/test-fixtures/ink-meter.ts') = await import(/* @vite-ignore */ meterUrl);
        const model = { ...api.fixture(bytes), width: 595.28, height: 841.89 };
        const samples = [];
        for (let sample = -2; sample < 5; sample++) {
          const meter = inkMeter(), started = performance.now();
          const display = await api.show(model, zoom, count);
          while (!display.mounted.every(({ target }) => target.querySelector('[data-word-ink-ready]') || (target.querySelector('canvas[data-word-ink-page]')?.getAttribute('width') ?? '300') !== '300')) {
            if (display.errors.length) throw Error(display.errors.join('; '));
            if (performance.now() - started > 60_000) throw Error('Ink timed out');
            await new Promise(resolve => setTimeout(resolve, 0));
          }
          const elapsedMs = performance.now() - started;
          const allocation = meter.finish();
          if (sample >= 0) samples.push({ elapsedMs, ...allocation });
          await display.dispose();
          await new Promise(resolve => setTimeout(resolve, 30));
        }
        return samples;
      }, { bytes, zoom, count });
      rows.push({ dpr, zoom, pages: count, samples });
    }
    await context.close();
  }
  const { writeFile } = await import('node:fs/promises');
  await writeFile(process.env.INK_BENCHMARK!, JSON.stringify({ browser: browser.version(), warmups: 2, repeats: 5, rows }, null, 2));
});
