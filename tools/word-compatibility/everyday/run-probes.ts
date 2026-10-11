import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { everydayTasks } from './catalog.ts';
import { headlessProbes } from './headless-probes.ts';
import { blockers } from './blockers.ts';
import { runBrowserProbes } from './browser-probes.ts';
import { hashDefinition } from '../evaluate.ts';
import { sha256 } from '../inventory.ts';
import { command } from '../process.ts';
import type { TaskProbe } from './probe-model.ts';

export async function runEverydayProbes(root: string, output: string): Promise<readonly TaskProbe[]> {
  const directory = join(output, 'everyday');
  await mkdir(directory, { recursive: true });
  if ((await readdir(directory)).length) throw new Error('Everyday evidence directory must be empty; stale results cannot count.');
  const results: TaskProbe[] = [];
  const adapterHash = sha256(await readFile(join(root, 'tools/word-compatibility/everyday/headless-probes.ts')));
  for (const [id, run] of Object.entries(headlessProbes)) {
    const artifacts: { path: string; sha256: string }[] = [];
    let status: TaskProbe['status'] = 'verified', detail = 'Headless operation, saved-package assertions and SDK validation passed.';
    try {
      const fixtures = run();
      if (!fixtures.length) throw new Error('Headless task produced no fixtures');
      const paths: string[] = [];
      for (const fixture of fixtures) {
        const path = join(directory, `${id}-${fixture.name}.docx`);
        await Bun.write(path, fixture.bytes); paths.push(path);
        artifacts.push({ path: relative(output, path), sha256: sha256(fixture.bytes) });
      }
      const dotnet = process.env.DOTNET ?? Bun.which('dotnet');
      if (!dotnet || !await Bun.file(join(output, 'validator/OpenXmlValidator.dll')).exists()) { status = 'blocked'; detail = 'Headless assertions passed; SDK is unavailable, so exported packages remain unqualified.'; }
      else {
        const checked = await command([dotnet, join(output, 'validator/OpenXmlValidator.dll'), ...paths]);
        const log = join(directory, `${id}-openxml.log`); await Bun.write(log, checked.output);
        artifacts.push({ path: relative(output, log), sha256: sha256(new TextEncoder().encode(checked.output)) });
        if (checked.code !== 0) throw new Error(`SDK rejected exported fixtures or failed; see ${relative(output, log)}`);
      }
    } catch (error) { status = 'failed'; detail = error instanceof Error ? error.message : String(error); }
    const log = join(directory, `${id}.json`);
    const bytes = new TextEncoder().encode(JSON.stringify({ id, status, detail }, null, 2));
    await Bun.write(log, bytes); artifacts.push({ path: relative(output, log), sha256: sha256(bytes) });
    results.push({ id, status, detail, definitionHash: hashDefinition({ id, adapterHash }), artifacts });
  }
  for (const [id, blocker] of Object.entries(blockers)) {
    const artifacts: { path: string; sha256: string }[] = [];
    const sources = await Promise.all(blocker.sources.map(async path => ({ path, sha256: sha256(await readFile(join(root, path))) })));
    const bytes = new TextEncoder().encode(JSON.stringify({ id, outcome: 'blocked', ...blocker, sources }, null, 2));
    const file = join(directory, `${id}.json`); await Bun.write(file, bytes);
    artifacts.push({ path: relative(output, file), sha256: sha256(bytes) });
    results.push({ id, status: 'blocked', detail: blocker.reason, definitionHash: hashDefinition({ id, blocker, sources }), artifacts });
  }
  results.push(...await runBrowserProbes(root, directory));
  const missing = everydayTasks.filter(task => !task.requirements.length && !results.some(result => result.id === task.id));
  if (missing.length) throw new Error(`Missing task probes: ${missing.map(task => task.id).join(', ')}`);
  return results;
}
