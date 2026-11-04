/// <reference types="bun" />
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
// Keep Playwright browser-process state out of the main Bun test runner.
async function run() {
  const build = Bun.spawn(
    [process.execPath, resolve(import.meta.dir, 'presentation-rail-fixture.ts')],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [code, script, error] = await Promise.all([
    build.exited,
    new Response(build.stdout).text(),
    new Response(build.stderr).text(),
  ]);
  if (code !== 0) throw new Error(error);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><body></body>');
    await page.addScriptTag({ content: script });
    const first = page.locator('button[data-index="0"]');
    const second = page.locator('button[data-index="1"]');
    const preview = page.locator('.drag-preview');
    assert.equal(await first.getAttribute('title'), null);
    assert.equal(await first.getAttribute('data-host-hint'), 'true');
    assert.equal(await page.evaluate<number>('window.hints'), 2);
    const startDrag = async () => {
      await first.hover();
      await page.mouse.down();
      await page.mouse.move(300, 330);
      await preview.waitFor({ state: 'visible' });
    };
    const expectAtPointer = async (x: number, y: number) => {
      const bounds = await preview.boundingBox();
      assert.ok(bounds);
      // The preview rotates by two degrees, slightly changing its bounding box.
      assert.ok(Math.abs(bounds.x - (x + 14)) < 5);
      assert.ok(Math.abs(bounds.y - (y + 12)) < 5);
      assert.equal(await preview.evaluate((node) => node.parentElement === document.body), true);
    };

    await startDrag();
    await expectAtPointer(300, 330);
    await page.mouse.move(400, 360);
    await expectAtPointer(400, 360);
    await page.mouse.up();
    await preview.waitFor({ state: 'detached' });
    assert.deepEqual(await page.evaluate<{ id: string; index: number }[]>('window.moves'), []);

    await startDrag();
    const secondBounds = (await second.boundingBox())!;
    await page.mouse.move(
      secondBounds.x + secondBounds.width / 2,
      secondBounds.y + secondBounds.height - 4,
    );
    await page.mouse.up();
    await preview.waitFor({ state: 'detached' });
    assert.deepEqual(await page.evaluate<{ id: string; index: number }[]>('window.moves'), [
      { id: 'first', index: 1 },
    ]);

    await startDrag();
    await page.keyboard.press('Escape');
    await preview.waitFor({ state: 'detached' });
    await page.mouse.up();
    assert.deepEqual(await page.evaluate<{ id: string; index: number }[]>('window.moves'), [
      { id: 'first', index: 1 },
    ]);

    const gap = page.locator('button[data-insertion="1"]');
    await gap.click();
    assert.deepEqual(await page.evaluate<number[]>('window.insertions'), []);
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate<number[]>('window.insertions'), [1]);
    assert.equal(await gap.evaluate(node => node === document.activeElement), true);
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    assert.deepEqual(await page.evaluate<number[]>('window.insertions'), [1, 1]);
    await page.keyboard.press('ArrowUp');
    assert.equal(await first.evaluate(node => node === document.activeElement), true);
    await gap.click();
    await page.keyboard.press('ArrowDown');
    assert.equal(await second.evaluate(node => node === document.activeElement), true);
    await page.locator('button[data-insertion="0"]').click();
    await page.keyboard.press('Enter');
    await page.locator('button[data-insertion="2"]').click();
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate<number[]>('window.insertions'), [1, 1, 0, 2]);

    await startDrag();
    await page.evaluate('window.destroy()');
    await preview.waitFor({ state: 'detached' });
    await page.mouse.up();
    assert.equal(await page.evaluate<number>('window.hints'), 0);
  } finally {
    await browser.close();
  }
}
await run();
