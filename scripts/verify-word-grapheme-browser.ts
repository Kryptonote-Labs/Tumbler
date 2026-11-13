import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { Page } from 'playwright-core';

/** Imported formatting can split a combining sequence into distinct native runs. */
export async function verifyWordGraphemeRuns(page: Page, consumer: string) {
  const fixture = join(consumer, 'grapheme-fixture.ts');
  await Bun.write(fixture, await Bun.file(join(import.meta.dir, 'fixtures/word-grapheme-browser.ts')).text());
  const built = await Bun.build({ entrypoints: [fixture], target: 'browser' });
  if (!built.success) throw new AggregateError(built.logs);
  await page.goto('about:blank');
  await page.addScriptTag({ content: await built.outputs[0]!.text() });
  const root = page.getByRole('textbox', { name: 'Formatted grapheme document' });
  const edge = await root.locator('span').first().evaluate(span => {
    const range = document.createRange();
    range.setStart(span.firstChild!, 1);
    range.collapse(true);
    const bounds = range.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y + bounds.height / 2 };
  });
  await page.mouse.click(edge.x - 2, edge.y);
  await page.keyboard.type('!');
  assert.equal(await root.innerText(), 'é!x');
  await page.keyboard.press('Control+z');
  await root.evaluate(root => {
    const text = root.querySelector('span')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.type('?');
  assert.equal(await root.innerText(), 'é?x');
  await page.keyboard.press('Control+z');
  await root.evaluate(root => {
    const mark = root.querySelectorAll('span')[1]!.firstChild!;
    document.getSelection()!.setBaseAndExtent(mark, 0, mark, 1);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.press('Backspace');
  assert.equal(await root.innerText(), 'x');
  await page.keyboard.type('a');
  assert.equal(await root.innerText(), 'ax');
}
