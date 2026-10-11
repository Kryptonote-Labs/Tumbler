import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { command } from '../process.ts';
import { sha256 } from '../inventory.ts';
import { hashDefinition } from '../evaluate.ts';
import type { TaskProbe } from './probe-model.ts';

export const browserTasks = ['editing.typing', 'editing.clipboard', 'editing.find-replace', 'viewing.pages', 'viewing.zoom', 'viewing.selection', 'viewing.outline'] as const;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
/** Consume only the fresh, local single-project Playwright run; never count skipped tests as passes. */
export function browserOutcomes(input: unknown): Map<string, { status: TaskProbe['status']; detail: string }> {
  const results = new Map<string, { status: TaskProbe['status']; detail: string }>();
  function visit(value: unknown) {
    if (!object(value)) return;
    if (Array.isArray(value.specs)) for (const spec of value.specs) {
      if (!object(spec) || typeof spec.title !== 'string' || !spec.title.startsWith('everyday:')) continue;
      const id = spec.title.slice('everyday:'.length);
      if (!browserTasks.some(task => task === id) || results.has(id) || !Array.isArray(spec.tests) || spec.tests.length !== 1) throw new Error(`Invalid browser evidence ${id}`);
      const test = spec.tests[0];
      if (!object(test) || !Array.isArray(test.results) || test.results.length !== 1 || !object(test.results[0])) throw new Error(`Missing browser result ${id}`);
      const result = test.results[0];
      const error = object(result.error) && typeof result.error.message === 'string' ? result.error.message.replace(/\u001b\[[0-9;]*m/g, '') : '';
      const status = result.status === 'passed' ? 'verified' : result.status === 'skipped' || /Executable doesn't exist|browserType.launch|Missing X server/.test(error) ? 'blocked' : 'failed';
      results.set(id, { status, detail: status === 'verified' ? 'Chromium assertions passed against the local Tumbler playground.' : error || `Browser result: ${String(result.status)}` });
    }
    if (Array.isArray(value.suites)) value.suites.forEach(visit);
  }
  visit(input);
  return results;
}
export async function runBrowserProbes(root: string, output: string): Promise<readonly TaskProbe[]> {
  const json = join(output, 'browser.json'), log = join(output, 'browser.log');
  const run = await command(['env', `PLAYWRIGHT_JSON_OUTPUT_NAME=${json}`, `EVERYDAY_BROWSER_OUTPUT=${join(output, 'browser-artifacts')}`, process.execPath, 'run', '--cwd', join(root, 'apps/docs'), 'test:e2e', '--config', 'everyday.config.ts', '--reporter=json'], 600_000);
  await Bun.write(log, run.output);
  let results: ReturnType<typeof browserOutcomes> = new Map();
  let issue = `Browser runner did not return complete evidence (exit ${run.code}); see browser.log.`;
  const artifacts = [{ path: 'everyday/browser.log', sha256: sha256(new TextEncoder().encode(run.output)) }];
  try {
    const bytes = await readFile(json);
    artifacts.push({ path: 'everyday/browser.json', sha256: sha256(bytes) });
    results = browserOutcomes(JSON.parse(bytes.toString()));
  } catch (error) { issue += ` ${String(error)}`; }
  const sourceHash = sha256(await readFile(join(root, 'apps/docs/benchmark/everyday-word.e2e.ts')));
  return browserTasks.map(id => ({ id, ...(results.get(id) ?? { status: 'blocked' as const, detail: issue }), definitionHash: hashDefinition({ id, sourceHash }), artifacts }));
}
