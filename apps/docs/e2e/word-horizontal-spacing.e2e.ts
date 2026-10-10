import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { createWordArtifact } from '@tumblerjs/word';

const title = 'OCR A LEVEL ENGLISH LANGUAGE';
const fixture = createWordArtifact({
  defaultFormat: { fontFamily: 'Times New Roman', fontSizePoints: 24, bold: true },
  paragraphs: [{ runs: [{ text: title }] }],
});

test('Word text preserves unkerned advances under inherited browser typography', async ({ page }) => {
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(fixture.bytes()) }));
  await page.goto('/playground/word-brief');
  await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  await page.addStyleTag({ content: 'body { text-rendering: optimizeLegibility; font-kerning: normal; }' });
  const result = await page.evaluate(async ({ title, url }) => {
    const { browserWordTextMeasurer } = await import(url) as typeof import('../../../packages/svelte/src/word-font-metrics.ts');
    const span = [...document.querySelectorAll<HTMLElement>('.word-page-content [data-start]:not(.caret-anchor)')].find(element => element.textContent === title)!;
    const node = span.firstChild!;
    const context = document.createElement('canvas').getContext('2d')!;
    context.fontKerning = 'normal';
    const measure = browserWordTextMeasurer(context);
    const format = { fontFamily: 'Times New Roman', fontSizePoints: 24, bold: true, italic: false, underline: 'none' as const, strike: false, color: '#000000', highlight: undefined, rightToLeft: false, verticalAlign: 'baseline' as const };
    const width = measure.measure(title, format).width * 4 / 3;
    const errors = [...title].map((_, index) => {
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, index + 1);
      const expected = [...title.slice(0, index + 1)].reduce((sum, letter) => sum + measure.measure(letter, format).width * 4 / 3, 0);
      return range.getBoundingClientRect().width - expected;
    });
    const painted = span.getBoundingClientRect().width;
    context.fontKerning = 'normal';
    const kerned = context.measureText(title).width;
    return { width, painted, errors, kerned };
  }, { title, url: `/@fs${resolve('node_modules/@tumblerjs/svelte/src/word-font-metrics.ts')}` });
  // Ensure the fixture exercises an actual kerning pair, rather than passing with a fallback font.
  expect(result.width - result.kerned).toBeGreaterThan(1);
  expect(Math.abs(result.painted - result.width)).toBeLessThan(0.04);
  for (const error of result.errors) expect(Math.abs(error)).toBeLessThan(0.04);
});
