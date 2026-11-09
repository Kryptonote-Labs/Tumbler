/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

test('PDF merge graphical workflow has shared API and CLI page-selection parity', async () => {
  const run = Bun.spawn([process.execPath, resolve(import.meta.dir, 'pdf-merge-browser.ts')], { stdout: 'pipe', stderr: 'pipe' });
  const [code, output, error] = await Promise.all([run.exited, new Response(run.stdout).text(), new Response(run.stderr).text()]);
  if (code !== 0) throw new Error(error || output || `PDF merge browser exited with ${code}`);
  expect(code).toBe(0);
}, 60000);
