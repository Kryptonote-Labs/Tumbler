/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

test('slide drag previews follow viewport coordinates outside transformed panes and clean up', async () => {
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
    expect(await first.getAttribute('title')).toBeNull();
    expect(await first.getAttribute('data-host-hint')).toBe('true');
    expect(await page.evaluate<number>('window.hints')).toBe(2);
    const startDrag = async () => {
      await first.hover();
      await page.mouse.down();
      await page.mouse.move(300, 330);
      await preview.waitFor({ state: 'visible' });
    };
    const expectAtPointer = async (x: number, y: number) => {
      const bounds = await preview.boundingBox();
      expect(bounds).not.toBeNull();
      // The preview rotates by two degrees, slightly changing its bounding box.
      expect(Math.abs(bounds!.x - (x + 14))).toBeLessThan(5);
      expect(Math.abs(bounds!.y - (y + 12))).toBeLessThan(5);
      expect(await preview.evaluate((node) => node.parentElement === document.body)).toBe(true);
    };

    await startDrag();
    await expectAtPointer(300, 330);
    await page.mouse.move(400, 360);
    await expectAtPointer(400, 360);
    await page.mouse.up();
    await preview.waitFor({ state: 'detached' });
    expect(await page.evaluate<{ id: string; index: number }[]>('window.moves')).toEqual([]);

    await startDrag();
    const secondBounds = (await second.boundingBox())!;
    await page.mouse.move(
      secondBounds.x + secondBounds.width / 2,
      secondBounds.y + secondBounds.height - 4,
    );
    await page.mouse.up();
    await preview.waitFor({ state: 'detached' });
    expect(await page.evaluate<{ id: string; index: number }[]>('window.moves')).toEqual([
      { id: 'first', index: 1 },
    ]);

    await startDrag();
    await page.keyboard.press('Escape');
    await preview.waitFor({ state: 'detached' });
    await page.mouse.up();
    expect(await page.evaluate<{ id: string; index: number }[]>('window.moves')).toEqual([
      { id: 'first', index: 1 },
    ]);

    await startDrag();
    await page.evaluate('window.destroy()');
    await preview.waitFor({ state: 'detached' });
    await page.mouse.up();
    expect(await page.evaluate<number>('window.hints')).toBe(0);
  } finally {
    await browser.close();
  }
}, 30_000);
