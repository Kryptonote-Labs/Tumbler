import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openWordArtifact, wordParagraphText } from '@tumblerjs/word';

test.setTimeout(120_000);

async function openEditor(page: Page) {
  await page.goto('/playground/word-brief');
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await selectTitle(page);
}

async function selectTitle(page: Page, start = 2, end = 9) {
  await page.evaluate(({ start, end }) => {
    const run = [...document.querySelectorAll<HTMLElement>('[data-paragraph][data-start]:not([data-story])')]
      .find(node => node.textContent === 'A quieter workspace')!;
    run.closest<HTMLElement>('[contenteditable]')!.focus();
    getSelection()!.setBaseAndExtent(run.firstChild!, start, run.firstChild!, end);
    document.dispatchEvent(new Event('selectionchange'));
  }, { start, end });
}

const title = (page: Page) => page.locator('.word-page-content [data-paragraph="14"]:not(.caret-anchor)');

test('Ctrl+I cannot create formatting outside the model', async ({ page }) => {
  await openEditor(page);
  await page.keyboard.press('Control+i');
  await expect(page.locator('.word-page-content i')).toHaveCount(0);
  await expect(title(page)).toHaveText('A quieter workspace');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.keyboard.insertText('calm');
  await expect(title(page)).toHaveText('A calm workspace');
  await page.keyboard.press('Control+z');
  await expect(title(page)).toHaveText('A quieter workspace');
});

test('replacement and soft-line deletion use target ranges instead of the caret', async ({ page }) => {
  await openEditor(page);
  await selectTitle(page, 19, 19);
  await page.evaluate(() => {
    const run = document.querySelector('[data-paragraph="14"][data-start="0"]')!;
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: 'calm' });
    Object.defineProperty(event, 'getTargetRanges', { value: () => [new StaticRange({ startContainer: run.firstChild!, startOffset: 2, endContainer: run.firstChild!, endOffset: 9 })] });
    run.dispatchEvent(event);
  });
  await expect(title(page)).toHaveText('A calm workspace');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const artifact = openWordArtifact(new Uint8Array(await readFile((await (await downloadPromise).path())!)));
  const heading = artifact.document.blocks.find(block => block.kind === 'paragraph' && block.elementId === 14);
  expect(heading?.kind === 'paragraph' ? wordParagraphText(artifact.document, heading) : undefined).toBe('A calm workspace');
  await page.evaluate(() => {
    const run = document.querySelector('[data-paragraph="14"][data-start="0"]')!;
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteSoftLineBackward' });
    Object.defineProperty(event, 'getTargetRanges', { value: () => [new StaticRange({ startContainer: run.firstChild!, startOffset: 0, endContainer: run.firstChild!, endOffset: 2 })] });
    run.dispatchEvent(event);
  });
  await expect(title(page)).toHaveText('calm workspace');
});

test('composition commits once and a single undo restores the selection text', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    const root = document.querySelector('[contenteditable=true]')!;
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    for (const data of ['n', 'ni', '你']) {
      root.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertCompositionText', data, isComposing: true }));
      root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data, isComposing: true }));
    }
    root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你' }));
  });
  await expect(title(page)).toHaveText('A 你 workspace');
  await page.keyboard.press('Control+z');
  await expect(title(page)).toHaveText('A quieter workspace');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('non-cancellable replacement reconciles mutated DOM before applying the model edit', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    const root = document.querySelector('[contenteditable=true]')!;
    root.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertReplacementText', data: 'calm' }));
    const run = root.querySelector('[data-paragraph="14"][data-start="0"]')!;
    run.innerHTML = 'A <i>calm</i> workspace';
    root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: 'calm' }));
  });
  await expect(title(page)).toHaveText('A calm workspace');
  await expect(page.locator('.word-page-content i')).toHaveCount(0);
  await page.keyboard.insertText('!');
  await expect(title(page)).toHaveText('A calm! workspace');
});

test('unsupported input benchmark', async ({ page }) => {
  test.skip(!process.env.WORD_INPUT_BENCH);
  await openEditor(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const heapBefore = (await cdp.send('Performance.getMetrics')).metrics.find(metric => metric.name === 'JSHeapUsedSize')!.value;
  const result = await page.evaluate(() => {
    const root = document.querySelector('[contenteditable=true]')!;
    const run = (count: number) => {
      let cancelled = 0;
      const start = performance.now();
      for (let i = 0; i < count; i++) {
        const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'formatItalic' });
        root.dispatchEvent(event);
        cancelled += Number(event.defaultPrevented);
      }
      return { ms: performance.now() - start, operations: count, cancelled };
    };
    run(200);
    const nodesBefore = root.querySelectorAll('*').length;
    const textBefore = root.textContent;
    const samples = Array.from({ length: 7 }, () => run(1000));
    return { userAgent: navigator.userAgent, samples, nodesBefore, nodesAfter: root.querySelectorAll('*').length, textUnchanged: root.textContent === textBefore };
  });
  await cdp.send('HeapProfiler.collectGarbage');
  const heapAfter = (await cdp.send('Performance.getMetrics')).metrics.find(metric => metric.name === 'JSHeapUsedSize')!.value;
  console.log('WORD_INPUT_BENCH', JSON.stringify({ ...result, heapBefore, heapAfter, retainedHeapDelta: heapAfter - heapBefore }));
});

test('Chromium composition replaces provisional text and commits one undo step', async ({ page }) => {
  await openEditor(page);
  const cdp = await page.context().newCDPSession(page);
  for (const text of ['n', 'ni', '你']) {
    await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
  }
  await cdp.send('Input.insertText', { text: '你' });
  await expect(title(page)).toHaveText('A 你 workspace');
  await page.keyboard.press('Control+z');
  await expect(title(page)).toHaveText('A quieter workspace');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('input without beforeinput restores the model and cancelled composition preserves text', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    const root = document.querySelector('[contenteditable=true]')!;
    root.querySelector('[data-paragraph="14"][data-start="0"]')!.innerHTML = '<b>untracked</b>';
    root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatBold' }));
  });
  await expect(title(page)).toHaveText('A quieter workspace');
  await selectTitle(page);
  await page.evaluate(() => {
    const root = document.querySelector('[contenteditable=true]')!;
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    root.querySelector('[data-paragraph="14"][data-start="0"]')!.textContent = 'A ni workspace';
    root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
  });
  await expect(title(page)).toHaveText('A quieter workspace');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('paste and browser history intents stay in the model', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', 'calm');
    document.querySelector('[contenteditable=true]')!.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertFromPaste', dataTransfer }));
  });
  await expect(title(page)).toHaveText('A calm workspace');
  for (const [inputType, expected] of [['historyUndo', 'A quieter workspace'], ['historyRedo', 'A calm workspace']]) {
    await page.evaluate(inputType => document.querySelector('[contenteditable=true]')!.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType })), inputType!);
    await expect(title(page)).toHaveText(expected!);
  }
});

test('read-only input and target ranges outside the body cannot edit the document', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    const outside = document.querySelector('h1')!.firstChild!;
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: 'wrong' });
    Object.defineProperty(event, 'getTargetRanges', { value: () => [new StaticRange({ startContainer: outside, startOffset: 0, endContainer: outside, endOffset: 1 })] });
    document.querySelector('[contenteditable=true]')!.dispatchEvent(event);
  });
  await expect(title(page)).toHaveText('A quieter workspace');
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.evaluate(() => {
    document.querySelector('.word-page-content')!.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'wrong' }));
  });
  await expect(title(page)).toHaveText('A quieter workspace');
});

test('touch viewport accepts replacement input without a keyboard shortcut', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await openEditor(page);
  await page.keyboard.insertText('calm');
  await expect(title(page)).toHaveText('A calm workspace');
  await context.close();
});

test('partial combining-mark deletion targets remove one whole model grapheme', async ({ page }) => {
  await openEditor(page);
  await page.keyboard.insertText('e\u0301');
  await expect(title(page)).toHaveText('A e\u0301 workspace');
  await page.evaluate(() => {
    const run = document.querySelector('[data-paragraph="14"][data-start="0"]')!;
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward' });
    Object.defineProperty(event, 'getTargetRanges', { value: () => [new StaticRange({ startContainer: run.firstChild!, startOffset: 3, endContainer: run.firstChild!, endOffset: 4 })] });
    run.dispatchEvent(event);
  });
  await expect(title(page)).toHaveText('A  workspace');
  await page.keyboard.press('Control+z');
  await expect(title(page)).toHaveText('A e\u0301 workspace');
});
