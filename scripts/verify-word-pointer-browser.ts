import assert from 'node:assert/strict';
import type { Locator, Page } from 'playwright-core';

/** Trusted mouse input is essential: setting selection offsets cannot expose broken drag behavior. */
export async function verifyWordPointerBrowser(page: Page) {
  const root = page.getByRole('textbox', { name: 'Document text' });
  const paragraph = root.locator('p').first();
  await paragraph.scrollIntoViewIfNeeded();
  const points = await paragraph.evaluate(element => {
    const node = element.querySelector('span')!.firstChild!;
    const at = (offset: number) => {
      const range = document.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      const rect = range.getBoundingClientRect();
      return { x: rect.x, y: rect.y + rect.height / 2 };
    };
    return { start: at(0), middle: at(9), end: at(node.textContent!.length) };
  });
  const selected = () => page.evaluate(() => getSelection()!.toString());
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.middle.x, points.middle.y, { steps: 16 });
  await page.mouse.up();
  assert.equal(await selected(), 'Edit this');
  await page.mouse.move(points.end.x, points.end.y);
  await page.mouse.down();
  await page.mouse.move(points.middle.x, points.middle.y, { steps: 16 });
  await page.mouse.up();
  assert.equal(await selected(), ' highlighted text.');
  const backward = await page.evaluate(() => {
    const selection = getSelection()!;
    return { anchor: selection.anchorOffset, focus: selection.focusOffset };
  });
  assert(backward.anchor > backward.focus);

  // Start at the line end and drag back into the text, as in the reported recording.
  await page.mouse.move(points.end.x + 35, points.end.y);
  await page.mouse.down();
  await page.mouse.move(points.middle.x, points.middle.y, { steps: 16 });
  await page.mouse.up();
  assert.equal(await selected(), ' highlighted text.');
  await page.mouse.dblclick(points.start.x + 50, points.start.y);
  assert.equal(await selected(), 'this');
  await page.mouse.click(points.middle.x, points.middle.y, { clickCount: 3 });
  assert.equal(await selected(), 'Edit this highlighted text.');
  await page.mouse.click(points.start.x, points.start.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(points.middle.x, points.middle.y);
  await page.keyboard.up('Shift');
  assert.equal(await selected(), 'Edit this');
  await page.mouse.click(points.start.x, points.start.y);

  // A word remains one selection unit when formatting splits it into multiple runs.
  await paragraph.evaluate(element => {
    const node = element.querySelector('span')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(node, 12, node, 15);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  const wordPoint = await textPoint(paragraph, 13);
  await page.mouse.dblclick(wordPoint.x, wordPoint.y);
  assert.equal(await selected(), 'highlighted');
  await page.keyboard.press('Control+z');
  await page.mouse.click(points.start.x, points.start.y);
}

export async function textPoint(element: Locator, offset: number) {
  return element.evaluate((element, offset) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const length = node.textContent!.length;
      if (offset <= length) {
        const range = document.createRange();
        range.setStart(node, offset);
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        return { x: rect.x, y: rect.y + rect.height / 2 };
      }
      offset -= length;
    }
    throw new Error('Offset outside rendered text');
  }, offset);
}

export async function dragText(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
}


export async function showLine(element: Locator) {
  await element.evaluate(element => window.scrollBy({ top: element.getBoundingClientRect().top - 180, behavior: 'instant' }));
}
