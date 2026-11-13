import assert from 'node:assert/strict';
import sharp from 'sharp';
import type { Page } from 'playwright-core';
import { showLine, textPoint } from './verify-word-pointer-browser.ts';

/** Check painted pixels, not just a collapsed selection's geometry. */
export async function verifyWordCaretBrowser(page: Page) {
  const root = page.getByRole('textbox', { name: 'Document text' });
  const line = root.locator('p').first();
  const caret = page.locator('[data-word-caret]');
  await showLine(line);
  // A portaled overlay must resolve light-dark() in the document page's scheme, not the app's.
  await root.evaluate(element => (element as HTMLElement).style.setProperty('--tumbler-word-caret-color', 'light-dark(rgb(32, 91, 198), rgb(240, 240, 240))'));
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const offset of [0, 13, 27]) {
      const point = await textPoint(line, offset);
      await page.mouse.click(point.x, point.y);
      await assertPaintedCaret(page);
      const caretBounds = await caret.boundingBox();
      assert(caretBounds && Math.abs(caretBounds.x - point.x) <= 1);
      assert(caretBounds.height >= 12);
    }
  }
  // Host-supplied caret colors update without remounting the input adapter.
  await root.evaluate(element => (element as HTMLElement).style.setProperty('--tumbler-word-caret-color', '#c02060'));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-word-caret]')!).backgroundColor === 'rgb(192, 32, 96)');
  await assertPaintedCaret(page, [192, 32, 96]);
  await root.evaluate(element => (element as HTMLElement).style.removeProperty('--tumbler-word-caret-color'));
  await page.emulateMedia({ colorScheme: 'light' });

  await page.keyboard.press('Control+a');
  await caret.waitFor({ state: 'detached' });
  const start = await textPoint(line, 0);
  await page.mouse.click(start.x, start.y);
  await assertPaintedCaret(page);
  await page.getByRole('button', { name: 'Bold', exact: true }).focus();
  await caret.waitFor({ state: 'detached' });
  assert.notEqual(await root.evaluate(element => getComputedStyle(element).caretColor), 'rgba(0, 0, 0, 0)');

  await page.mouse.click(start.x, start.y);
  await root.evaluate(element => element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await caret.waitFor({ state: 'detached' });
  assert.notEqual(await root.evaluate(element => getComputedStyle(element).caretColor), 'rgba(0, 0, 0, 0)');
  await root.evaluate(element => element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })));
  await assertPaintedCaret(page);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await caret.waitFor({ state: 'detached' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await assertPaintedCaret(page);
}

export async function assertPaintedCaret(page: Page, color: readonly number[] = [32, 91, 198]) {
  const caret = page.locator('[data-word-caret]');
  try { await caret.waitFor({ state: 'visible', timeout: 3000 }); }
  catch (error) {
    console.error('Caret diagnostic', await page.evaluate(() => {
      const root = document.querySelector('[role="textbox"]')!;
      const line = root.querySelector('p')!;
      const selection = getSelection()!;
      const bounds = line.getBoundingClientRect();
      const range = selection.rangeCount ? selection.getRangeAt(0).getBoundingClientRect().toJSON() : undefined;
      const hit = document.elementFromPoint(bounds.left, bounds.top + bounds.height / 2);
      return { focus: document.hasFocus(), active: document.activeElement?.className, collapsed: selection.isCollapsed,
        focusNode: selection.focusNode?.nodeName, focusParent: selection.focusNode?.parentElement?.className, offset: selection.focusOffset,
        line: bounds.toJSON(), root: root.getBoundingClientRect().toJSON(), range, text: line.textContent, hit: hit?.className,
        nativeColor: getComputedStyle(root).caretColor };
    }));
    throw error;
  }
  assert.equal(await caret.count(), 1);
  await caret.evaluate(element => {
    for (const animation of element.getAnimations()) { animation.pause(); animation.currentTime = 0; }
  });
  const bounds = (await caret.boundingBox())!;
  const image = await page.screenshot({ clip: { x: Math.floor(bounds.x), y: Math.floor(bounds.y), width: 2, height: Math.ceil(bounds.height) + 2 } });
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let painted = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (color.every((value, channel) => Math.abs(data[offset + channel]! - value) < 5)) painted++;
  }
  assert(painted >= bounds.height * 0.65, `Caret is positioned but not painted: ${painted} matching pixels for ${bounds.height}px height`);
  await caret.evaluate(element => { for (const animation of element.getAnimations()) animation.play(); });
}
