/// <reference types="bun" />
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

async function run() {
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
    await page.locator('[data-pdf-page="1"]').waitFor();
    await page.keyboard.press('Control+f');
    const initialSearch = page.getByLabel('Search document', {exact:true});
    await initialSearch.fill('Line');
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent === '1 of 30');
    await initialSearch.press('Enter');
    assert.equal(await page.getByRole('status').textContent(), '2 of 30');
    await initialSearch.press('Shift+Enter');
    assert.equal(await page.getByRole('status').textContent(), '1 of 30');
    await initialSearch.fill('Line 29');
    await page.waitForFunction(() => {
      const mark = document.querySelector('[data-pdf-search-match="0"]');
      return !!mark && mark.closest('[data-pdf-page]')?.getAttribute('data-pdf-page') !== '1';
    });
    await initialSearch.press('Escape');
    const first = page.locator('[data-pdf-page="1"] .glyph').first();
    await first.waitFor();
    await first.scrollIntoViewIfNeeded();
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
    assert.ok(next > boundary);
    await input.press('Shift+ArrowUp');
    const selected = await input.evaluate((element: HTMLTextAreaElement) => ({
      start: element.selectionStart,
      end: element.selectionEnd,
      direction: element.selectionDirection,
    }));
    assert.ok(selected.start <= boundary);
    assert.equal(selected.end, next);
    assert.equal(selected.direction, 'backward');
    await input.press('Control+End');
    await page.getByRole('button', { name: 'Mono', exact: true }).click();
    await input.pressSequentially('X');
    assert.equal(await page.evaluate<string>('window.lastFace()'), 'Mono-Regular');
    await page.getByRole('button', { name: 'Add text', exact: true }).click();
    const continuation = page.locator('[data-pdf-page="2"]');
    await continuation.scrollIntoViewIfNeeded();
    const position = (await continuation.boundingBox())!;
    await page.mouse.click(position.x + 60, position.y + 40);
    await input.pressSequentially('Placed here');
    assert.ok(
      (await continuation.locator('.glyph').allTextContents()).join('').includes('Placed here'),
    );
    assert.ok(
      !(await page.locator('[data-pdf-page="1"] .glyph').allTextContents())
        .join('')
        .includes('Placed here'),
    );
    await page.getByRole('button', { name: 'Repeated text', exact: true }).click();
    const repeated = page.locator('[data-pdf-page="1"] .glyph').first();
    await repeated.scrollIntoViewIfNeeded();
    const r = (await repeated.boundingBox())!;
    await page.mouse.click(r.x + 2, r.y + r.height * 0.6);
    await input.press('Control+Home');
    await input.press('Delete');
    assert.equal(await input.inputValue(), 'AA');
    assert.deepEqual(await page.evaluate<{ insert: string; color: string }[]>('window.colours()'), [
      { insert: 'AA', color: '#0000ff' },
    ]);
    await page.getByRole('button', { name: 'Repeated text', exact: true }).click();
    const replacement = (await page.locator('[data-pdf-page="1"] .glyph').first().boundingBox())!;
    await page.mouse.click(replacement.x + 2, replacement.y + replacement.height * 0.6);
    await input.press('Control+Home');
    await input.press('ArrowRight');
    await input.press('Shift+ArrowRight');
    await input.press('Shift+ArrowRight');
    await input.pressSequentially('X');
    assert.equal(await input.inputValue(), 'AX');
    assert.deepEqual(await page.evaluate<{ insert: string; color: string }[]>('window.colours()'), [
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
    assert.equal(await input.inputValue(), 'BZAAA');
    assert.deepEqual(await page.evaluate<{ insert: string; color: string }[]>('window.colours()'), [
      { insert: 'B', color: '#00ff00' },
      { insert: 'ZA', color: '#ff0000' },
      { insert: 'AA', color: '#0000ff' },
    ]);
    await page.keyboard.press('Control+f');
    const search = page.getByLabel('Search document', {exact:true});
    await search.fill('AAA');
    await page.waitForFunction(() => document.querySelectorAll('[data-pdf-search-match]').length > 0);
    assert.equal(await page.getByRole('status').textContent(), '1 of 1');
    await search.fill('aaa');
    await page.getByRole('button', {name:'Match case',exact:true}).click();
    assert.equal(await page.getByRole('status').textContent(), '0 of 0');
    await page.getByRole('button', {name:'Match case',exact:true}).click();
    await search.press('Enter');
    assert.equal(await page.getByRole('status').textContent(), '1 of 1');
    await search.press('Shift+Enter');
    await page.evaluate('window.remotePrefix()');
    await search.fill('BBZ');
    await page.waitForFunction(() => document.querySelectorAll('[data-pdf-search-match]').length > 0);
    await search.press('Escape');
    assert.equal(await page.locator('[data-pdf-search-match]').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
await run();
