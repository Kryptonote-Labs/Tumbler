import { expect, test } from '@playwright/test';
import { createWordArtifact, NativeWordDocument, type WordAuthoredShape, type WordContentBlock } from '@tumblerjs/word';

test('overflowing shape text keeps its full height and vertical anchor', async ({ page }) => {
  const shapes = (['top', 'center', 'bottom'] as const).map((textAnchor): WordAuthoredShape => ({
    preset: 'rect', width: 100, height: 60, fill: 'none', outline: 'none', outlineWidth: 0,
    layout: 'inline', textAnchor, alt: `Overflow ${textAnchor}`,
    textBody: Array.from({ length: 4 }, () => ({
      runs: [{ text: 'MMMMMMMMMMMM', format: { fontFamily: 'Courier New', fontSizePoints: 12 } }],
      paragraph: { spacingBeforeTwips: 0, spacingAfterTwips: 0, lineSpacing: { rule: 'exact', value: 240 } },
    })),
  }));
  const artifact = createWordArtifact({ paragraphs: shapes.map(shape => ({ runs: [{ text: '\uFFFC', shape }] })) });
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(artifact.bytes()) }));
  await page.goto('/playground/word-brief');
  await expect(page.getByRole('img', { name: 'Overflow top', exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');

  for (const shape of shapes) {
    const story = page.getByRole('img', { name: shape.alt!, exact: true }).getByRole('textbox', { name: 'Shape text', exact: true });
    await expect(story).toHaveText('MMMMMMMMMMMM'.repeat(4));
    const actual = await story.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const frame = element.closest('[role="img"]')!.getBoundingClientRect();
      const intrinsicHeight = Array.from(element.children).reduce((height, child) => height + child.getBoundingClientRect().height, 0);
      return { y: (bounds.y - frame.y) * 3 / 4, height: bounds.height * 3 / 4, intrinsicHeight: intrinsicHeight * 3 / 4 };
    });
    // Use rendered line heights so font fallback does not affect the alignment check.
    expect(actual.intrinsicHeight).toBeGreaterThan(shape.height);
    expect(actual.height).toBeCloseTo(actual.intrinsicHeight, 1);
    const free = shape.height - 3.6 - 3.6 - actual.intrinsicHeight;
    const expectedY = 3.6 + (shape.textAnchor === 'top' ? 0 : shape.textAnchor === 'bottom' ? free : free / 2);
    expect(actual.y).toBeCloseTo(expectedY, 1);
  }
});

test('signed insets stay visible in body and auxiliary shapes, with clipping at the page', async ({ page }) => {
  const paragraph = (alt: string, left = -30): WordContentBlock => ({
    kind: 'paragraph', runs: [{ text: '\uFFFC', shape: {
      preset: 'rect', width: 100, height: 60, fill: 'none', outline: 'none', outlineWidth: 0,
      layout: 'inline', textAnchor: 'top', alt, textInsets: { top: 0, right: 0, bottom: 0, left },
      textBody: [{ runs: [{ text: 'AAAAAA', format: { fontFamily: 'Arial', fontSizePoints: 12 } }], alignment: 'start' }],
    } }],
  });
  const model = new NativeWordDocument();
  model.update([paragraph('Body inset')]);
  for (const kind of ['header', 'footer'] as const) {
    model.updateStory({ section: 0, kind, type: 'default' }, [
      paragraph(`${kind} inset`),
      { kind: 'table', rows: [[{ blocks: [paragraph(`${kind} table inset`)] }]] },
      ...(kind === 'header' ? [paragraph('Page boundary inset', -90)] : []),
    ]);
  }
  const artifact = model.artifact();
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(artifact.bytes()) }));
  await page.goto('/playground/word-brief');
  await expect(page.getByRole('img', { name: 'Body inset', exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');

  for (const name of ['Body inset', 'header inset', 'footer inset', 'header table inset', 'footer table inset', 'Page boundary inset']) {
    const shape = page.getByRole('img', { name, exact: true });
    await shape.scrollIntoViewIfNeeded();
    const story = shape.getByRole('textbox', { name: 'Shape text', exact: true });
    await expect(story).toHaveText('AAAAAA');
    const result = await story.evaluate(element => {
      const span = element.querySelector('span')!;
      // Hit testing checks actual clipping; text rectangles alone include clipped glyphs.
      span.style.pointerEvents = 'auto';
      const range = document.createRange();
      range.setStart(span.firstChild!, 0);
      range.setEnd(span.firstChild!, 1);
      const glyph = range.getBoundingClientRect();
      const frame = element.closest('[role="img"]')!.getBoundingClientRect();
      const paper = element.closest('.word-page')!.getBoundingClientRect();
      return {
        outsideShape: glyph.right < frame.left,
        insidePage: glyph.left > paper.left,
        hit: document.elementsFromPoint(glyph.x + glyph.width / 2, glyph.y + glyph.height / 2).includes(span),
      };
    });
    expect(result.outsideShape, name).toBe(true);
    expect(result.insidePage, name).toBe(name !== 'Page boundary inset');
    expect(result.hit, name).toBe(name !== 'Page boundary inset');
  }
});
