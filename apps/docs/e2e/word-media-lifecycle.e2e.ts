import { test, expect } from '@playwright/test';

interface MediaAudit { created: number; revoked: number; live: Record<string, number>; revokedWhileMounted: number }
declare global { interface Window { wordMediaAudit: MediaAudit } }

test('typing reuses image URLs and document replacement releases them after DOM updates', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const audit: MediaAudit = { created: 0, revoked: 0, live: {}, revokedWhileMounted: 0 };
    window.wordMediaAudit = audit;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      const url = create(blob);
      if (blob instanceof Blob && blob.type.startsWith('image/')) {
        audit.created++;
        audit.live[url] = blob.size;
      }
      return url;
    };
    URL.revokeObjectURL = url => {
      if (url in audit.live) {
        audit.revoked++;
        if ([...document.querySelectorAll('img')].some(image => image.src === url)) audit.revokedWhileMounted++;
        delete audit.live[url];
      }
      revoke(url);
    };
  });
  await page.goto('/playground/word-brief');
  const images = page.locator('.word-scroller img');
  await expect(images.first()).toBeVisible({ timeout: 60_000 });
  await images.evaluateAll(async nodes => { await Promise.all(nodes.map(node => (node as HTMLImageElement).decode())); });
  const initial = await page.evaluate(() => structuredClone(window.wordMediaAudit));
  expect(initial.created).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByText('A quieter workspace', { exact: true }).click();
  await page.keyboard.press('Home');
  for (let edit = 0; edit < 120; edit++) await page.keyboard.insertText('x');
  console.log(JSON.stringify({ phase: 'after 120 edits', initial, edited: await page.evaluate(() => window.wordMediaAudit) }));
  await expect.poll(() => page.evaluate(() => window.wordMediaAudit.created)).toBe(initial.created);
  await images.evaluateAll(async nodes => { await Promise.all(nodes.map(node => (node as HTMLImageElement).decode())); });
  const edited = await page.evaluate(() => structuredClone(window.wordMediaAudit));
  expect(edited.live).toEqual(initial.live);
  expect(edited.revokedWhileMounted).toBe(0);
  // Uploading the same file replaces the artifact and exercises viewer destruction/remount.
  await page.getByLabel('Choose a document').setInputFiles('static/samples/project-brief.docx');
  await expect(page.getByText('A quieter workspace', { exact: true })).toBeVisible();
  await images.evaluateAll(async nodes => { await Promise.all(nodes.map(node => (node as HTMLImageElement).decode())); });
  const swapped = await page.evaluate(() => structuredClone(window.wordMediaAudit));
  expect(Object.keys(swapped.live).length).toBe(Object.keys(initial.live).length);
  expect(Object.values(swapped.live).reduce((a, b) => a + b, 0)).toBe(Object.values(initial.live).reduce((a, b) => a + b, 0));
  expect(swapped.revokedWhileMounted).toBe(0);
  await page.getByRole('link', { name: 'Read the docs' }).click();
  await expect(page.locator('.word-scroller')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Object.keys(window.wordMediaAudit.live).length)).toBe(0);
  expect(await page.evaluate(() => window.wordMediaAudit.revokedWhileMounted)).toBe(0);
  console.log(JSON.stringify({ initial, edited, swapped }));
});
