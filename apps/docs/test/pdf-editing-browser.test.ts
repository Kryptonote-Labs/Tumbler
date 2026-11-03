/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

test('PDF editing preserves navigation, placement, formatting and native input', async () => {
  // Bun 1.3 can hang when Playwright launches a second browser in the test runner.
  const run = Bun.spawn([process.execPath, resolve(import.meta.dir, 'pdf-editing-browser.ts')], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [code, output, error] = await Promise.all([
    run.exited,
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
  ]);
  if (code !== 0) throw new Error(error || output || `PDF browser regression exited with ${code}`);
  expect(code).toBe(0);
}, 30000);
