// Run only in a checkout combining PR120 and PR126; the ink test harness belongs to PR126.
import { test, expect } from '@playwright/test';
import { inkFixture } from '../../../packages/word/test/ink-fixture.ts';
import { officeInk } from '../../../packages/ink/test/fixture.ts';
import { pictureFixture } from '../../../packages/word/test/picture-fixture.ts';
import type { WordImageDrawing, WordLayoutPage } from '@tumblerjs/word';

const source = inkFixture(false, false, officeInk({ brush: '<brushProperty name="width" value="0.05" units="cm"/><brushProperty name="height" value="0.05" units="cm"/><brushProperty name="rasterOp" value="xOrPen"/><brushProperty name="color" value="#ffffff"/>' })).source;
const drawing = [...source.document.drawings.values()][0]!;
const bytes = [...source.updateDrawing({ elementId: drawing.elementId, widthPoints: 8, heightPoints: 8, layout: 'front', xPoints: 100, yPoints: 58 }).bytes()];
const picture = [...pictureFixture({ anchors: [1], crop: 'l="50000"', transform: 'rot="5400000"' })];
const wordUrl = '/@fs' + new URL('../../../packages/word/src/index.ts', import.meta.url).pathname;

test('rotated picture crossing an ink tile is composed; unrelated broken rotated image is excluded', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ bytes, picture, wordUrl }) => {
    type Box = { x: number; y: number; width: number; height: number };
    const harnessUrl = '/src/lib/test-fixtures/ink-overlay.ts';
    const api = await import(/* @vite-ignore */ harnessUrl) as {
      fixture(bytes: number[]): WordLayoutPage;
      show(page: WordLayoutPage, scale: number): Promise<{ mounted: { target: HTMLElement }[]; errors: string[]; dispose(): Promise<void> }>;
      wordInkTiles(page: WordLayoutPage, scale: number): { tiles: Box[]; scale: number };
    };
    const word = await import(wordUrl) as typeof import('../../../packages/word/src/index.ts');
    const model = api.fixture(bytes), picturePage = api.fixture(picture);
    const pictureFragment = picturePage.columns[0]!.lines[0]!.fragments.find(f => f.drawing)!;
    if (pictureFragment.drawing?.kind !== 'image') throw Error('Expected picture');
    const valid: WordImageDrawing = { ...pictureFragment.drawing, anchor: { ...pictureFragment.drawing.anchor!, behindDocument: true } };
    const broken: WordImageDrawing = { ...valid, elementId: -100, bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' };
    const column = model.columns[0]!, line = column.lines[0]!;
    const combined = { ...model, columns: [{ ...column, lines: [{ ...line, fragments: [
      { ...pictureFragment, drawing: valid }, { ...pictureFragment, x: 500, y: 500, drawing: broken }, ...line.fragments,
    ] }, ...column.lines.slice(1)] }, ...model.columns.slice(1)] };
    const plan = api.wordInkTiles(combined, 4 / 3);
    const regions = plan.tiles.map(tile => ({ x: tile.x / plan.scale, y: tile.y / plan.scale, width: tile.width / plan.scale, height: tile.height / plan.scale }));
    // PR126 adds this optional second parameter without changing the returned model.
    const imagesInRegions = word.wordPageImages as (page: WordLayoutPage, regions: readonly Box[]) => WordImageDrawing[];
    const selected = imagesInRegions(combined, regions);
    const image = new Image(); image.src = URL.createObjectURL(new Blob([new Uint8Array(valid.bytes)], { type: valid.contentType })); await image.decode();
    const reference = document.createElement('canvas'), backdrop = document.createElement('canvas');
    reference.width = backdrop.width = Math.ceil(model.width * plan.scale);
    reference.height = backdrop.height = Math.ceil(model.height * plan.scale);
    const ctx = reference.getContext('2d')!, under = backdrop.getContext('2d')!;
    const options = { scale: plan.scale, inkMaxPixels: Infinity, image: (d: WordImageDrawing) => d === valid ? image : undefined };
    word.paintWordPage(ctx, combined, options);
    word.paintWordPage(under, combined, { ...options, omitDestinationInk: true });
    const display = await api.show(combined, 1);
    const target = display.mounted[0]!.target;
    for (let attempt = 0; attempt < 1000 && !target.querySelector('[data-word-ink-ready]') && !display.errors.length; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    let differences = 0, colouredInkPixels = 0;
    const canvases = [...target.querySelectorAll('canvas')];
    for (const [index, canvas] of canvases.entries()) {
      const tile = plan.tiles[index]!;
      const actual = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      const expected = ctx.getImageData(tile.x, tile.y, tile.width, tile.height).data;
      const original = under.getImageData(tile.x, tile.y, tile.width, tile.height).data;
      for (let i = 0; i < actual.length; i += 4) {
        const changed = expected.slice(i, i + 4).some((value, channel) => value !== original[i + channel]);
        const alpha = changed ? expected[i + 3] : 0;
        if (actual[i + 3] !== alpha || alpha && actual.slice(i, i + 3).some((value, channel) => value !== expected[i + channel])) differences++;
        if (alpha && expected[i] !== expected[i + 1]) colouredInkPixels++;
      }
    }
    const answer = { selectedValid: selected.includes(valid), selectedBroken: selected.includes(broken), frameMissesTiles: regions.every(region => region.y + region.height < pictureFragment.y), ready: !!target.querySelector('[data-word-ink-ready]'), errors: display.errors.slice(), differences, colouredInkPixels, tiles: canvases.length };
    await display.dispose(); URL.revokeObjectURL(image.src);
    return answer;
  }, { bytes, picture, wordUrl });
  expect(result).toMatchObject({ selectedValid: true, selectedBroken: false, frameMissesTiles: true, ready: true, errors: [], differences: 0 });
  expect(result.colouredInkPixels).toBeGreaterThan(0);
  expect(result.tiles).toBeGreaterThan(0);
});
