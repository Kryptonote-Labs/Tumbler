/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

// Real pointer sequences exercise the boundary between editing text and moving objects.
test('slide text and table cells edit on one click while manipulation stays available', async () => {
  const build = Bun.spawn([process.execPath, resolve(import.meta.dir, 'presentation-click-fixture.ts')], {
    stdout: 'pipe', stderr: 'pipe',
  });
  const [code, script, buildError] = await Promise.all([
    build.exited, new Response(build.stdout).text(), new Response(build.stderr).text(),
  ]);
  if (code !== 0) throw new Error(buildError);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://fixture.local/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
    );
    await page.goto('https://fixture.local/');
    await page.addScriptTag({ content: script });
    const objects = page.locator('[data-slide-object]');
    await objects.first().waitFor();
    const title = objects.filter({ hasText: 'Click to add title' });
    await title.locator('.hit').click({ position: { x: 50, y: 40 } });
    const active = page.locator('[contenteditable="true"]');
    await active.waitFor();
    await page.keyboard.type('Single click title');
    expect(errors).toEqual([]);
    expect(await active.innerText()).toContain('Single click title');
    await page.keyboard.press('Escape');

    const shape = objects.filter({ hasText: 'Existing text' });
    await shape.locator('.hit').click({ position: { x: 80, y: 35 } });
    await active.waitFor();
    expect(await active.innerText()).toContain('Existing text');
    // Resizing remains available during text editing.
    const handles = shape.locator('.resize');
    expect(await handles.count()).toBe(8);
    const resizeBox = await handles.last().boundingBox();
    if (!resizeBox) throw new Error('Missing resize handle');
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizeBox.x + 30, resizeBox.y + 20, { steps: 4 });
    await page.mouse.up();
    expect(await active.count()).toBe(0);
    expect(await page.evaluate('window.changes.length')).toBeGreaterThan(0);

    // A drag must not enter editing, even when the pointer returns to its origin.
    const hit = await shape.locator('.hit').boundingBox();
    if (!hit) throw new Error('Missing text box');
    await page.mouse.move(hit.x + 30, hit.y + 30);
    await page.mouse.down();
    await page.mouse.move(hit.x + 60, hit.y + 50, { steps: 3 });
    await page.mouse.move(hit.x + 30, hit.y + 30, { steps: 3 });
    await page.mouse.up();
    expect(await active.count()).toBe(0);
    await shape.locator('.hit').click({ modifiers: ['Shift'], position: { x: 40, y: 30 } });
    expect(await active.count()).toBe(0);

    const cells = page.locator('[data-table-cell]');
    await cells.first().locator('.cell-hit').click();
    await active.waitFor();
    await page.keyboard.type('First cell');
    expect(await cells.first().textContent()).toContain('First cell');
    await cells.nth(1).locator('.cell-hit').click();
    await active.waitFor();
    await page.keyboard.type('Second cell');
    expect(await cells.nth(1).textContent()).toContain('Second cell');

    await page.evaluate('window.readOnly()');
    await page.waitForFunction(() => !document.querySelector('[contenteditable="true"]'));
    await shape.click({ position: { x: 40, y: 30 } });
    expect(await active.count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
}, 30_000);
