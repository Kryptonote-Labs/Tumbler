import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { createWordArtifact } from '@tumblerjs/word';

const fontUrl = `/@fs${resolve('node_modules/@tumblerjs/svelte/src/word-font-metrics.ts')}`;
const wordUrl = `/@fs${resolve('node_modules/@tumblerjs/word/src/index.ts')}`;

for (const deviceScaleFactor of [1, 2]) {
  test.describe(`Word baselines at device scale ${deviceScaleFactor}`, () => {
    test.use({ deviceScaleFactor });
    test('CSS text lands on the layout baseline at different font sizes and faces', async ({ page }) => {
      await page.goto('/');
      const results = await page.evaluate(async (url) => {
        const { browserWordTextMeasurer, wordTextCss, wordTextTop } = await import(url) as typeof import('../../../packages/svelte/src/word-font-metrics.ts');
        await document.fonts.ready;
        const measure = browserWordTextMeasurer(document.createElement('canvas').getContext('2d')!);
        const errors: { font: string; size: number; bold: boolean; italic: boolean; error: number }[] = [];
        for (const fontFamily of ['serif', 'Arial', 'Times New Roman']) {
          for (const fontSizePoints of [11, 18, 24]) {
            for (const face of [{ bold: false, italic: false }, { bold: true, italic: false }, { bold: false, italic: true }]) {
              const format = { fontFamily, fontSizePoints, ...face, underline: 'none' as const, strike: false, color: '#000000', highlight: undefined, rightToLeft: false, verticalAlign: 'baseline' as const };
              const metrics = measure.measure('Baseline', format);
              const baseline = 100;
              const fragment = { format, baseline, y: baseline - metrics.ascent, height: metrics.ascent + metrics.descent };
              const span = document.createElement('span');
              span.style.cssText = `${wordTextCss(format)};position:fixed;left:0;top:${wordTextTop(fragment) * 4 / 3}px;line-height:${fragment.height * 4 / 3}px;white-space:pre`;
              span.textContent = 'Baseline';
              const marker = document.createElement('span');
              marker.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
              span.append(marker);
              document.body.append(span);
              errors.push({ font: fontFamily, size: fontSizePoints, ...face, error: marker.getBoundingClientRect().top - baseline * 4 / 3 });
              span.remove();
            }
          }
        }
        return errors;
      }, fontUrl);
      for (const result of results) expect(Math.abs(result.error), JSON.stringify(result)).toBeLessThan(0.04);
    });
  });
}

test('the Word component paints body text on the engine baselines', async ({ page }) => {
  const fixture = createWordArtifact({
    defaultFormat: { fontFamily: 'Times New Roman', fontSizePoints: 11 },
    lineSpacing: 1.15,
    paragraphs: [
      { runs: [{ text: 'Baseline fixture' }] },
      ...[false, true].map(bold => ({ runs: [11, 18, 24].map(fontSizePoints => ({ text: `Size ${fontSizePoints} `, format: { fontSizePoints, bold } })) })),
    ],
  });
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(fixture.bytes()) }));
  await page.goto('/playground/word-brief');
  await expect(page.getByText('Baseline fixture', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  const errors = await page.evaluate(async ({ wordUrl, fontUrl }) => {
    const { openWordArtifact, layoutWordDocument } = await import(wordUrl) as typeof import('../../../packages/word/src/index.ts');
    const { browserWordTextMeasurer } = await import(fontUrl) as typeof import('../../../packages/svelte/src/word-font-metrics.ts');
    const source = new Uint8Array(await (await fetch('/samples/project-brief.docx')).arrayBuffer());
    await document.fonts.ready;
    const layout = layoutWordDocument(openWordArtifact(source).document, browserWordTextMeasurer(document.createElement('canvas').getContext('2d')!));
    const paper = document.querySelector('.word-page-content')!;
    const results: { text: string; error: number }[] = [];
    for (const line of layout.pages[0]!.columns.flatMap(column => column.lines)) {
      for (const fragment of line.fragments) {
        if (fragment.kind !== 'text') continue;
        const span = paper.querySelector<HTMLElement>(`[data-paragraph="${line.paragraphElementId}"][data-start="${fragment.startOffset}"]:not(.caret-anchor)`)!;
        const marker = document.createElement('span');
        marker.style.cssText = 'display:inline-block;position:static;width:0;height:0;vertical-align:baseline';
        span.append(marker);
        results.push({ text: fragment.text, error: marker.getBoundingClientRect().top - paper.getBoundingClientRect().top - fragment.baseline * 4 / 3 });
        marker.remove();
      }
    }
    return results;
  }, { wordUrl, fontUrl });
  expect(errors.length).toBeGreaterThan(5);
  for (const result of errors) expect(Math.abs(result.error), JSON.stringify(result)).toBeLessThan(0.05);
});
