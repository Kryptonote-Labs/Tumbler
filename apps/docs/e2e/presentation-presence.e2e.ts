import { test, expect } from '@playwright/test';

test('remote presentation selections follow text layout and session activity', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const checks = await page.evaluate(async () => {
    const url = '/src/lib/test-fixtures/presentation-presence.svelte.ts';
    const fixture: typeof import('../src/lib/test-fixtures/presentation-presence.svelte.ts') =
      await import(/* @vite-ignore */ url);
    return fixture.checkPresentationPresence();
  });
  expect(checks).toEqual([
    'text selection publication',
    'rotated caret',
    'independent zoom',
    'table cell selection',
    'presence cleanup',
    'multiple object selection',
    'empty aligned and rotated carets',
  ]);
  expect(errors).toEqual([]);
});
