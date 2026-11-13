import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium, firefox, type Page } from 'playwright-core';
import { verifyWordGraphemeRuns } from './verify-word-grapheme-browser.ts';
import { verifyWordNestedControls, verifyWordReplacementRange } from './verify-word-host-browser.ts';
import { verifyWordCaretBrowser, assertPaintedCaret } from './verify-word-caret-browser.ts';
import { verifyWordPointerBrowser, textPoint, dragText, showLine } from './verify-word-pointer-browser.ts';

/** Exercise the built, packed consumer in a real browser without a development server. */
export async function verifyWordReactBrowser(directory: string, engine: 'chromium' | 'firefox' = 'chromium', launchOptions: Parameters<typeof chromium.launch>[0] = { headless: true }) {
  const browser = await (engine === 'firefox' ? firefox : chromium).launch(launchOptions);
  try {
    const page = await browser.newPage();
    const errors: Error[] = [];
    page.on('pageerror', error => { errors.push(error); console.error(`Browser error: ${error.message}`); });
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
    await verifyWordCaretBrowser(page);
    await verifyWordPointerBrowser(page);
    await verifyWordNestedControls(page);
    await verifyWordReplacementRange(page);
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
    // Firefox may scroll a cleared line behind this example's sticky toolbar.
    await showLine(editor.locator('p'));
    await assertPaintedCaret(page);
    const emptyLine = (await editor.locator('p').boundingBox())!;
    const emptyCaret = (await page.locator('[data-word-caret]').boundingBox())!;
    assert(Math.abs(emptyCaret.x - emptyLine.x) <= 1 && Math.abs(emptyCaret.y - emptyLine.y) <= 1);
    await pasteText(page, 'Pasted\r\nsecond line');
    assert.equal(await editor.locator('p').count(), 2);
    assert.equal(await editor.locator('p').nth(1).innerText(), 'second line');
    await page.keyboard.press('Control+a');
    const copied = await copyText(page);
    assert.equal(copied, 'Pasted\nsecond line');
    const longText = 'Wrapped words '.repeat(600) + 'end';
    await pasteText(page, longText);
    assert(await editor.locator('.word-page').count() > 1);
    const firstLine = editor.locator('p').nth(0);
    const secondLine = editor.locator('p').nth(1);
    await showLine(firstLine);
    const lineEnd = await firstLine.evaluate(element => element.textContent!.length);
    const wrapPoint = await textPoint(firstLine, lineEnd);
    await page.mouse.click(wrapPoint.x, wrapPoint.y);
    assert(await firstLine.evaluate(element => element.contains(getSelection()!.focusNode)));
    await assertPaintedCaret(page);
    const firstPoint = await textPoint(firstLine, 2);
    const secondPoint = await textPoint(secondLine, 5);
    await dragText(page, firstPoint, secondPoint);
    const secondStart = Number(await secondLine.getAttribute('data-word-start'));
    assert.equal(await copyText(page), longText.slice(2, secondStart + 5));
    await dragText(page, secondPoint, firstPoint);
    assert.equal(await copyText(page), longText.slice(2, secondStart + 5));

    const lastOnPage = editor.locator('.word-page').nth(0).locator('p').last();
    const firstOnNextPage = editor.locator('.word-page').nth(1).locator('p').first();
    await showLine(lastOnPage);
    const beforeGap = await textPoint(lastOnPage, 3);
    const afterGap = await textPoint(firstOnNextPage, 6);
    const pageStart = Number(await lastOnPage.getAttribute('data-word-start')) + 3;
    const pageEnd = Number(await firstOnNextPage.getAttribute('data-word-start')) + 6;
    await dragText(page, beforeGap, afterGap);
    assert.equal(await copyText(page), longText.slice(pageStart, pageEnd));
    await dragText(page, afterGap, beforeGap);
    assert.equal(await copyText(page), longText.slice(pageStart, pageEnd));

    await showLine(firstLine);
    const scrollStart = await page.evaluate(() => scrollY);
    const topPoint = await textPoint(firstLine, 0);
    await page.mouse.move(topPoint.x, topPoint.y);
    await page.mouse.down();
    await page.mouse.move(topPoint.x + 20, page.viewportSize()!.height - 2, { steps: 15 });
    await page.waitForFunction(start => scrollY > start + 60, scrollStart, { timeout: 3000 });
    await page.mouse.up();
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
    await verifyWordGraphemeRuns(page, directory);
    assert.deepEqual(errors, []);
    console.log(`${engine} React browser checks passed: formatting/export, typing, paragraph split, undo/redo, IME deduplication, grapheme deletion, select-all, clipboard, forward/backward/margin drag, word/paragraph/shift selection, wrapped lines/pages, drag scrolling, painted caret in light/dark modes and empty lines.`);
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
    const event = new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
    root.dispatchEvent(event);
    return event.clipboardData!.getData('text/plain');
  });
}

async function pasteText(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Document text' }).evaluate((root, text) => {
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
    // Firefox creates its own clipboard store for synthetic events.
    event.clipboardData!.setData('text/plain', text);
    root.dispatchEvent(event);
  }, text);
}
