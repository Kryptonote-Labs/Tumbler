import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

test('toolbar insertion replaces selected shape text and appends when the shape is selected', async ({ page }) => {
  await page.goto('/playground/word-brief');
  const modulePath = '/@fs' + fileURLToPath(new URL('../../../packages/svelte/src/word-shape-text-editor.ts', import.meta.url));
  const result = await page.evaluate(async (modulePath) => {
    const module: typeof import('../../../packages/svelte/src/word-shape-text-editor.ts') = await import(/* @vite-ignore */ modulePath);
    const { ShapeTextEditorView } = module;
    const root = document.createElement('div');
    document.body.append(root);
    const shape = { preset: 'rect', width: 200, height: 60, fill: '#ffffff', outline: '#000000', outlineWidth: 1, text: 'Hello world' };
    let paragraphs: readonly import('../../../packages/word/src/index.ts').WordTextParagraph[] = [{ runs: [{ text: 'Hello world' }] }];
    const editor = new ShapeTextEditorView(root, shape, (value) => { paragraphs = value; }, () => {}, () => {}, () => {});
    try {
      editor.insertText('©');
      const appended = paragraphs.flatMap(p => p.runs.map(r => r.text)).join('');
      editor.update({ ...shape, textBody: paragraphs }, true);
      const node = root.querySelector('span')!.firstChild!;
      document.getSelection()!.setBaseAndExtent(node, 6, node, 11);
      document.dispatchEvent(new Event('selectionchange'));
      editor.insertText('€');
      return { appended, replaced: paragraphs.flatMap(p => p.runs.map(r => r.text)).join('') };
    } finally {
      editor.destroy();
      root.remove();
    }
  }, modulePath);
  expect(result).toEqual({ appended: 'Hello world©', replaced: 'Hello €©' });
});
