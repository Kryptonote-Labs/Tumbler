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

test('signed insets stay visible outside shapes and clip at cell and page boundaries', async ({ page }) => {
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
      // The signed inset extends beyond the shape while remaining inside this cell.
      { kind: 'table', rows: [[{ format: { margins: { topTwips: 0, endTwips: 108, bottomTwips: 0, startTwips: 800 } }, blocks: [paragraph(`${kind} table inset`)] }]] },
      // Retain the original unpadded geometry to test text crossing the cell edge.
      { kind: 'table', rows: [[{ blocks: [paragraph(`${kind} cell boundary inset`)] }]] },
      ...(kind === 'header' ? [paragraph('Page boundary inset', -90)] : []),
    ]);
  }
  const artifact = model.artifact();
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(artifact.bytes()) }));
  await page.goto('/playground/word-brief');
  await expect(page.getByRole('img', { name: 'Body inset', exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');

  for (const name of ['Body inset', 'header inset', 'footer inset', 'header table inset', 'footer table inset', 'header cell boundary inset', 'footer cell boundary inset', 'Page boundary inset']) {
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
      const cell = [...element.closest('.word-page')!.querySelectorAll('[data-cell]')]
        .map(node => node.getBoundingClientRect())
        .find(bounds => frame.left >= bounds.left && frame.left < bounds.right && frame.top >= bounds.top && frame.top < bounds.bottom);
      return {
        insideCell: cell ? glyph.left > cell.left && glyph.right < cell.right && (glyph.top + glyph.bottom) / 2 >= cell.top && (glyph.top + glyph.bottom) / 2 < cell.bottom : undefined,
        outsideShape: glyph.right < frame.left,
        insidePage: glyph.left > paper.left,
        hit: document.elementsFromPoint(glyph.x + glyph.width / 2, glyph.y + glyph.height / 2).includes(span),
      };
    });
    expect(result.outsideShape, name).toBe(true);
    expect(result.insidePage, name).toBe(name !== 'Page boundary inset');
    if (name.includes('table inset') || name.includes('cell boundary inset')) {
      expect(result.insideCell, name).toBe(!name.includes('boundary'));
    }
    expect(result.hit, name).toBe(!name.includes('boundary'));
  }
});
