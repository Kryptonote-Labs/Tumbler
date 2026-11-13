import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { textPoint } from './verify-word-pointer-browser.ts';

/** Property inputs and independently editable captions must never become Word commands. */
export async function verifyWordNestedControls(page: Page) {
  const root = page.getByRole('textbox', { name: 'Document text' });
  const text = await root.locator('p').innerText();
  await root.evaluate(root => {
    const controls = document.createElement('div');
    controls.dataset.testControls = '';
    controls.contentEditable = 'false';
    Object.assign(controls.style, { position: 'absolute', top: '120px', left: '20px', zIndex: '2' });
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Image alt text');
    const caption = document.createElement('div');
    caption.contentEditable = 'true';
    caption.tabIndex = 0;
    caption.setAttribute('aria-label', 'Shape caption');
    controls.append(input, caption);
    root.append(controls);
  });
  const input = page.getByRole('textbox', { name: 'Image alt text' });
  await input.fill('alt');
  assert.equal(await input.inputValue(), 'alt');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('new alt');
  assert.equal(await input.inputValue(), 'new alt');
  assert.equal(await root.locator('p').innerText(), text);
  await page.locator('[data-word-caret]').waitFor({ state: 'detached' });
  const caption = page.getByLabel('Shape caption');
  await caption.fill('caption');
  assert.equal(await caption.innerText(), 'caption');
  assert.equal(await root.locator('p').innerText(), text);
  await page.locator('[data-word-caret]').waitFor({ state: 'detached' });
  const prevented = await input.evaluate(element => {
    const events = [
      new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', bubbles: true, cancelable: true }),
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() }),
      new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() }),
      new ClipboardEvent('cut', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() }),
    ];
    for (const event of events) element.dispatchEvent(event);
    return events.map(event => event.defaultPrevented);
  });
  assert.deepEqual(prevented, [false, false, false, false]);
  assert.equal(await root.locator('p').innerText(), text);
  await root.locator('[data-test-controls]').evaluate(element => element.remove());
  const point = await textPoint(root.locator('p'), 0);
  await page.mouse.click(point.x, point.y);
}

/** Browser spell-check ranges identify the word even when the visible caret is elsewhere. */
export async function verifyWordReplacementRange(page: Page) {
  const root = page.getByRole('textbox', { name: 'Document text' });
  await root.evaluate(root => {
    const text = root.querySelector('p span')!.firstChild!;
    (root as HTMLElement).focus();
    document.getSelection()!.setBaseAndExtent(text, text.textContent!.length, text, text.textContent!.length);
    const target = new StaticRange({ startContainer: text, startOffset: 0, endContainer: text, endOffset: 4 });
    const event = new InputEvent('beforeinput', { inputType: 'insertReplacementText', data: 'Revised', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'getTargetRanges', { value: () => [target] });
    root.dispatchEvent(event);
  });
  assert.equal(await root.locator('p').innerText(), 'Revised this highlighted text.');
  await page.keyboard.press('Control+z');
  assert.equal(await root.locator('p').innerText(), 'Edit this highlighted text.');
  const point = await textPoint(root.locator('p'), 0);
  await page.mouse.click(point.x, point.y);
}
