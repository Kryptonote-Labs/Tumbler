import { expect, test } from '@playwright/test';
import { createWordArtifact } from '@tumblerjs/word';

test('spaces past the margin keep fitting words on their line', async ({ page }) => {
  const artifact = createWordArtifact({
    page: { width: 78, height: 400, margin: 20 },
    defaultFormat: { fontFamily: 'Courier New', fontSizePoints: 12 },
    paragraphs: [{ runs: [{ text: 'AB CD' }, { text: ' '.repeat(20) }, { text: 'E' }] }],
  });
  await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(artifact.bytes()) }));
  await page.goto('/playground/word-brief');
  await expect(page.getByText('AB CD', { exact: true })).toBeVisible({ timeout: 20_000 });
  const first = page.getByText('AB CD', { exact: true });
  const next = page.getByText('E', { exact: true });
  await expect(next).toBeVisible();
  const a = (await first.boundingBox())!;
  const b = (await next.boundingBox())!;
  expect(Math.abs(a.x - b.x)).toBeLessThan(0.1);
  // Twenty spaces must not insert additional visual lines before E.
  expect(b.y - a.y).toBeGreaterThan(a.height * 0.9);
  expect(b.y - a.y).toBeLessThan(a.height * 1.1);
});
