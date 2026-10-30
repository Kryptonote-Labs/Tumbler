import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

declare global {
  interface Window {
    marqueeFixture: {
      selection(): string[];
      selectKeys(keys: string[]): void;
      objectKeys(): string[];
      undo(): void;
    };
  }
}

test('marquee, host selection and table dragging preserve a group and undo together', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/playground/slides-brief');
  const fixturePath = '/@fs' + fileURLToPath(new URL('../src/lib/fixtures/PresentationSelection.svelte', import.meta.url));
  await page.evaluate(async fixturePath => {
    const { mount, default: Fixture } = await import(/* @vite-ignore */ fixturePath);
    const target = document.createElement('div');
    target.dataset.selectionFixture = '';
    target.style.cssText = 'position:fixed;inset:0;width:1000px;height:700px;z-index:10000;background:white';
    document.body.append(target);
    window.marqueeFixture = mount(Fixture, { target }) as unknown as Window['marqueeFixture'];
  }, fixturePath);
  const stage = page.locator('[data-selection-fixture]');
  const svg = stage.locator('svg.slide');
  await expect(svg).toBeVisible();
  const box = (await svg.boundingBox())!;
  const factor = box.width / 800;
  const point = (x: number, y: number) => ({ x: box.x + x * factor, y: box.y + y * factor });
  const drag = async (x: number, y: number, endX: number, endY: number) => {
    await page.mouse.move(point(x, y).x, point(x, y).y);
    await page.mouse.down();
    await page.mouse.move(point(endX, endY).x, point(endX, endY).y, { steps: 6 });
    await page.mouse.up();
  };
  const selection = () => page.evaluate(() => window.marqueeFixture.selection());
  const keys = await page.evaluate(() => window.marqueeFixture.objectKeys());
  await page.evaluate(keys => window.marqueeFixture.selectKeys(keys), keys.slice(0, 2));
  await expect.poll(selection).toEqual(keys.slice(0, 2));
  await page.evaluate(() => window.marqueeFixture.selectKeys([]));
  await expect.poll(selection).toEqual([]);
  // Start in the workspace gutter and enclose the shapes in reverse.
  await drag(-8, 190, 370, 80);
  await expect.poll(selection).toEqual(keys.slice(0, 2));
  await page.keyboard.down('Shift');
  await page.mouse.click(point(470, 120).x, point(470, 120).y);
  await page.keyboard.up('Shift');
  await expect.poll(selection).toEqual(keys);
  const objects = stage.locator('[data-slide-object]');
  const transforms = () => objects.evaluateAll(nodes => nodes.map(node => node.getAttribute('transform')));
  const original = await transforms();
  await drag(470, 120, 500, 145);
  await expect.poll(transforms).not.toEqual(original);
  const moved = await transforms();
  expect(moved.every((value, index) => value !== original[index])).toBe(true);
  await expect.poll(selection).toEqual(keys);
  await page.evaluate(() => window.marqueeFixture.undo());
  await expect.poll(transforms).toEqual(original);
  await svg.press('ArrowRight');
  const nudged = await transforms();
  expect(nudged.every((value, index) => value !== original[index])).toBe(true);
  await svg.press('Escape');
  await expect.poll(selection).toEqual([]);
  expect(errors).toEqual([]);
});
