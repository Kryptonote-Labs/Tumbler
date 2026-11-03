/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

test('PDF arrow selection crosses continuation pages and newly placed text stays on its clicked page', async () => {
  const build = Bun.spawn([process.execPath, resolve(import.meta.dir, 'pdf-editing-fixture.ts')], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [code, script, error] = await Promise.all([
    build.exited,
    new Response(build.stdout).text(),
    new Response(build.stderr).text(),
  ]);
  if (code !== 0) throw new Error(error);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 750 } }),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://fixture.local/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
    );
    await page.goto('https://fixture.local/');
    await page.addScriptTag({ content: script });
    const first = page.locator('[data-pdf-page="1"] .glyph').first();
    await first.waitFor();
    const box = (await first.boundingBox())!;
    await page.mouse.click(box.x + 2, box.y + box.height * 0.6);
    const input = page.getByLabel('Edit PDF text');
    const boundary = await page.evaluate<number>('window.lastCaret()');
    await input.evaluate((element: HTMLTextAreaElement, offset) => {
      element.setSelectionRange(offset, offset);
      element.dispatchEvent(new Event('select'));
    }, boundary);
    await input.press('ArrowDown');
    const next = await input.evaluate((element: HTMLTextAreaElement) => element.selectionStart);
    expect(next).toBeGreaterThan(boundary);
    await input.press('Shift+ArrowUp');
    const selected = await input.evaluate((element: HTMLTextAreaElement) => ({
      start: element.selectionStart,
      end: element.selectionEnd,
      direction: element.selectionDirection,
    }));
    expect(selected.start).toBeLessThanOrEqual(boundary);
    expect(selected.end).toBe(next);
    expect(selected.direction).toBe('backward');
    await input.press('Control+End');
    await page.getByRole('button', { name: 'Mono', exact: true }).click();
    await input.pressSequentially('X');
    expect(await page.evaluate('window.lastFace()')).toBe('Mono-Regular');
    await page.getByRole('button', { name: 'Add text', exact: true }).click();
    const continuation = page.locator('[data-pdf-page="2"]');
    await continuation.scrollIntoViewIfNeeded();
    const position = (await continuation.boundingBox())!;
    await page.mouse.click(position.x + 60, position.y + 40);
    await input.pressSequentially('Placed here');
    expect((await continuation.locator('.glyph').allTextContents()).join('')).toContain(
      'Placed here',
    );
    expect(
      (await page.locator('[data-pdf-page="1"] .glyph').allTextContents()).join(''),
    ).not.toContain('Placed here');
    await page.getByRole('button', { name: 'Repeated text', exact: true }).click();
    const repeated = page.locator('[data-pdf-page="1"] .glyph').first();
    await repeated.scrollIntoViewIfNeeded();
    const r = (await repeated.boundingBox())!;
    await page.mouse.click(r.x + 2, r.y + r.height * 0.6);
    await input.press('Control+Home');
    await input.press('Delete');
    expect(await input.inputValue()).toBe('AA');
    expect(await page.evaluate('window.colours()')).toEqual([{ insert: 'AA', color: '#0000ff' }]);
    await page.getByRole('button', { name: 'Repeated text', exact: true }).click();
    const replacement = (await page.locator('[data-pdf-page="1"] .glyph').first().boundingBox())!;
    await page.mouse.click(replacement.x + 2, replacement.y + replacement.height * 0.6);
    await input.press('Control+Home');
    await input.press('ArrowRight');
    await input.press('Shift+ArrowRight');
    await input.press('Shift+ArrowRight');
    await input.pressSequentially('X');
    expect(await input.inputValue()).toBe('AX');
    expect(await page.evaluate('window.colours()')).toEqual([
      { insert: 'A', color: '#ff0000' },
      { insert: 'X', color: '#0000ff' },
    ]);
    await page.getByRole('button', { name: 'Repeated text', exact: true }).click();
    await page.locator('[data-pdf-page="1"] .glyph').first().scrollIntoViewIfNeeded();
    const c = (await page.locator('[data-pdf-page="1"] .glyph').first().boundingBox())!;
    await page.mouse.click(c.x + 2, c.y + c.height * 0.6);
    await input.press('Control+Home');
    await input.evaluate((element: HTMLTextAreaElement) => {
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      element.value = 'ZAAA';
      element.setSelectionRange(1, 1);
      element.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertCompositionText',
          data: 'Z',
          isComposing: true,
        }),
      );
    });
    await page.evaluate('window.remotePrefix()');
    await input.evaluate((element) =>
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'Z' })),
    );
    expect(await input.inputValue()).toBe('BZAAA');
    expect(await page.evaluate('window.colours()')).toEqual([
      { insert: 'B', color: '#00ff00' },
      { insert: 'ZA', color: '#ff0000' },
      { insert: 'AA', color: '#0000ff' },
    ]);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
}, 30000);
