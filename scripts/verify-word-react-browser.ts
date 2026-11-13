import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';

/** Exercise the built, packed consumer in Chromium without a development server. */
export async function verifyWordReactBrowser(directory: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: Error[] = [];
    page.on('pageerror', error => errors.push(error));
    await page.route('http://tumbler.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const file = Bun.file(join(directory, 'dist', path === '/' ? 'index.html' : path));
      if (!await file.exists()) { await route.fulfill({ status: 404 }); return; }
      await route.fulfill({ body: Buffer.from(await file.arrayBuffer()), contentType: file.type });
    });
    await page.goto('http://tumbler.test/');
    const editor = page.getByRole('textbox', { name: 'Document text' });
    await editor.waitFor();
    assert.equal(await editor.innerText(), 'Edit this highlighted text.');
    assert.equal(await page.locator('[contenteditable="true"]').count(), 1);
    assert.equal(await editor.locator('.word-page').count(), 1);
    const paper = await editor.locator('.word-page').boundingBox();
    const textBounds = await editor.locator('p').first().boundingBox();
    assert(paper && textBounds && textBounds.x >= paper.x + 90 && textBounds.y >= paper.y + 90);
    await page.mouse.click(textBounds.x + 30, textBounds.y + textBounds.height / 2);
    await page.keyboard.type('X');
    assert((await editor.innerText()).includes('X'));
    await page.keyboard.press('Control+z');
    await select(page, 0, 'Edit this highlighted text.'.length);
    await page.getByRole('button', { name: 'Clear highlight' }).click();
    await page.getByRole('button', { name: 'Export and reopen' }).click();
    assert.equal(await editor.locator('span').first().evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');

    await select(page, 'Edit this highlighted text.'.length);
    await page.keyboard.type('!');
    assert.equal(await editor.innerText(), 'Edit this highlighted text.!');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second');
    assert.equal(await editor.locator('p').count(), 2);
    assert.equal(await editor.locator('p').nth(1).innerText(), 'Second');
    await page.keyboard.press('Control+z');
    assert.equal(await editor.locator('p').nth(1).innerText(), 'Secon');
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await editor.locator('p').nth(1).innerText(), 'Second');

    // Provisional browser composition mutates DOM, then commits exactly once to the native model.
    await editor.evaluate(root => {
      root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      const selection = document.getSelection()!;
      const range = selection.getRangeAt(0);
      range.insertNode(document.createTextNode('日本'));
      root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '日本' }));
      root.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: '日本' }));
    });
    assert.equal(await editor.locator('p').nth(1).innerText(), 'Second日本');
    await page.keyboard.press('Control+z');
    assert.equal(await editor.locator('p').nth(1).innerText(), 'Second');
    await page.keyboard.press('Control+Shift+z');
    await page.getByRole('button', { name: 'Export and reopen' }).click();
    assert.equal(await editor.locator('p').nth(1).innerText(), 'Second日本');
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText('👩‍💻é');
    assert.equal(await editor.innerText(), '👩‍💻é');
    await page.keyboard.press('Backspace');
    assert.equal(await editor.innerText(), '👩‍💻');
    await page.keyboard.press('Backspace');
    assert.equal((await editor.innerText()).trim(), '');
    await editor.evaluate(root => {
      const clipboard = new DataTransfer();
      clipboard.setData('text/plain', 'Pasted\r\nsecond line');
      root.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
    });
    assert.equal(await editor.locator('p').count(), 2);
    assert.equal(await editor.locator('p').nth(1).innerText(), 'second line');
    await page.keyboard.press('Control+a');
    const copied = await editor.evaluate(root => {
      const clipboard = new DataTransfer();
      root.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: clipboard }));
      return clipboard.getData('text/plain');
    });
    assert.equal(copied, 'Pasted\nsecond line');
    const longText = 'Wrapped words '.repeat(600) + 'end';
    await editor.evaluate((root, text) => {
      const clipboard = new DataTransfer();
      clipboard.setData('text/plain', text);
      root.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
    }, longText);
    assert(await editor.locator('.word-page').count() > 1);
    // The same native paragraph continues across line and page DOM boundaries.
    await editor.locator('.word-page').nth(1).locator('p').first().click({ position: { x: 20, y: 6 } });
    await page.keyboard.type('Z');
    await page.keyboard.press('Control+a');
    const continuedText = await copyText(page);
    assert.equal(continuedText.length, longText.length + 1);
    assert(continuedText.includes('Z'));
    assert.equal(continuedText.replace('Z', ''), longText);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+a');
    assert.equal(await copyText(page), longText);
    await page.getByRole('button', { name: 'Export and reopen' }).click();
    await editor.click();
    await page.keyboard.press('Control+a');
    assert.equal(await copyText(page), longText);
    assert.deepEqual(errors, []);
    console.log('React browser checks passed: formatting/export, typing, paragraph split, undo/redo, IME deduplication, grapheme deletion, select-all, clipboard, in-page pointer input, wrapped paragraph/page selection.');
  } finally { await browser.close(); }
}

async function select(page: Page, start: number, end = start) {
  await page.getByRole('textbox', { name: 'Document text' }).evaluate((root, offsets) => {
    (root as HTMLElement).focus();
    const paragraph = root.querySelector('p')!;
    function at(offset: number) {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const length = node.textContent?.length ?? 0;
        if (offset <= length) return { node, offset };
        offset -= length;
      }
      throw new Error('Offset outside paragraph');
    }
    const start = at(offsets.start);
    const end = at(offsets.end);
    document.getSelection()!.setBaseAndExtent(start.node, start.offset, end.node, end.offset);
    document.dispatchEvent(new Event('selectionchange'));
  }, { start, end });
}

async function copyText(page: Page) {
  return page.getByRole('textbox', { name: 'Document text' }).evaluate(root => {
    const clipboard = new DataTransfer();
    root.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: clipboard }));
    return clipboard.getData('text/plain');
  });
}
