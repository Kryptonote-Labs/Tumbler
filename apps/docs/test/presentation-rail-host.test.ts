/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

test('slide drag previews follow viewport coordinates outside transformed panes and clean up', async () => {
  const run = Bun.spawn(
    [process.execPath, resolve(import.meta.dir, 'presentation-rail-browser.ts')],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [code, output, error] = await Promise.all([
    run.exited,
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
  ]);
  if (code !== 0) throw new Error(error || output || `Browser regression exited with ${code}`);
  expect(code).toBe(0);
}, 30_000);
