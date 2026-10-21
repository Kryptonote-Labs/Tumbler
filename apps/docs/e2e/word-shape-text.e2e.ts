import { expect, test } from '@playwright/test';
import { createWordArtifact, type WordAuthoredShape } from '@tumblerjs/word';

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
