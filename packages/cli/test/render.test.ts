import { expect, test } from 'bun:test';
import { runTumbler } from '../src/index.ts';
import { createFileHost } from '../src/file-host.ts';

test('render dispatches physical page numbers and rejects invalid flags before calling the host', async () => {
  const calls: { page: number }[] = [];
  const host = {
    ...createFileHost(),
    async render(document: string, input: { page: number }) {
      expect(document).toBe('doc');
      calls.push(input);
      return { imageDelivered: true };
    },
  };
  let stdout = '';
  let stderr = '';
  const options = { host, stdout: (text: string) => { stdout += text; }, stderr: (text: string) => { stderr += text; } };
  expect(await runTumbler(['doc', 'render'], options)).toBe(0);
  expect(await runTumbler(['doc', 'render', '--page', '3'], options)).toBe(0);
  expect(calls).toEqual([{ page: 1 }, { page: 3 }]);
  expect(stdout).toContain('imageDelivered');
  for (const args of [['--page', '0'], ['--page', '-1'], ['--page', '1.5'], ['--page', 'abc'], ['--page='], ['--offset', '1'], ['--page', '1', '--page', '2']]) {
    expect(await runTumbler(['doc', 'render', ...args], options)).toBe(1);
  }
  expect(calls).toHaveLength(2);
  expect(stderr.length).toBeGreaterThan(0);
  expect(await runTumbler(['doc', 'render'], { ...options, host: createFileHost() })).toBe(1);
  expect(stderr).toContain('unavailable');
});
