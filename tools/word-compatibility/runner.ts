import { mkdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openWordArtifact } from '../../packages/word/src/index.ts';
import { sha256 } from './inventory.ts';
import { command } from './process.ts';
import type { Evidence, Oracle, Outcome } from './model.ts';
import type { Fixture, Scenario } from './scenarios.ts';

export interface RunnerOptions {
  readonly output: string;
  readonly root: string;
  readonly libreoffice: boolean;
}

/** Execute fresh evidence. There is deliberately no command to import arbitrary pass records. */
export async function runScenarios(scenarios: readonly Scenario[], options: RunnerOptions): Promise<Evidence[]> {
  const results: Evidence[] = [];
  const dotnet = process.env['DOTNET'] ?? Bun.which('dotnet');
  const office = options.libreoffice ? Bun.which('libreoffice') : null;
  let sdk: string | undefined;
  let sdkProblem = 'dotnet is unavailable; Open XML SDK validation was not run';
  await mkdir(options.output, { recursive: true });
  if (dotnet) {
    const build = await command([dotnet, 'build', join(options.root, 'tools/openxml-validator/OpenXmlValidator.csproj'), '-o', join(options.output, 'validator'), '--nologo'], 180_000);
    await Bun.write(join(options.output, 'openxml-build.log'), build.output);
    if (build.code === 0) sdk = join(options.output, 'validator/OpenXmlValidator.dll');
    else sdkProblem = 'Open XML SDK validator could not be built; see openxml-build.log';
  }
  if (dotnet) await Bun.write(join(options.output, 'dotnet-version.log'), (await command([dotnet, '--version'])).output);
  if (office) await Bun.write(join(options.output, 'libreoffice-version.log'), (await command([office, '--version'])).output);

  for (const scenario of scenarios) {
    const directory = join(options.output, scenario.id);
    await mkdir(directory, { recursive: true });
    const artifacts: Evidence['artifacts'][number][] = [];
    const record = (oracle: Oracle, outcome: Outcome, detail: string) => results.push({ scenario: scenario.id, oracle, outcome, detail, artifacts: [...artifacts] });
    let produced: ReturnType<Scenario['run']>;
    try {
      produced = scenario.run();
      for (const fixture of produced.fixtures) {
        const file = join(directory, `${fixture.name}.docx`);
        await Bun.write(file, fixture.bytes);
        artifacts.push({ path: relative(options.output, file), sha256: sha256(fixture.bytes) });
        fixture.verify(openWordArtifact(fixture.bytes));
      }
      record('assertion', 'passed', 'Explicit semantic assertions passed on the input and reparsed output fixtures.');
    } catch (error) {
      record('assertion', 'failed', message(error));
      for (const oracle of scenario.oracles.filter(oracle => oracle !== 'assertion')) record(oracle, 'blocked', 'Fixture assertions failed; dependent oracle not run.');
      continue;
    }
    if (scenario.oracles.includes('package-diff')) {
      if (!produced.comparePackages) record('package-diff', 'blocked', 'No package comparison implementation.');
      else try { produced.comparePackages(); record('package-diff', 'passed', 'No-op bytes or untouched entry payloads and package entry sets match.'); }
      catch (error) { record('package-diff', 'failed', message(error)); }
    }
    if (scenario.oracles.includes('openxml')) {
      if (!sdk || !dotnet) record('openxml', 'blocked', sdkProblem);
      else if (!produced.fixtures.length) record('openxml', 'blocked', 'No output fixtures to validate.');
      else {
        const validation = await command([dotnet, sdk, ...produced.fixtures.map(fixture => join(directory, `${fixture.name}.docx`))]);
        const log = join(directory, 'openxml.log');
        await Bun.write(log, validation.output);
        artifacts.push({ path: relative(options.output, log), sha256: sha256(validation.output) });
        record('openxml', validation.code === 0 ? 'passed' : 'failed', validation.code === 0 ? 'Open XML SDK accepted every fixture; this does not establish Word rendering or complete clause coverage.' : `Open XML SDK rejected the fixtures or failed (exit ${validation.code}); see ${scenario.id}/openxml.log`);
      }
    }
    if (scenario.oracles.includes('libreoffice')) {
      if (!office) record('libreoffice', 'blocked', options.libreoffice ? 'LibreOffice is unavailable.' : 'LibreOffice was not requested.');
      else {
        try {
          for (const fixture of produced.fixtures) await roundtrip(office, fixture, directory, options.output, artifacts);
          record('libreoffice', 'passed', 'LibreOffice round trips preserved the explicitly asserted semantics; accepted as the current interoperability reference.');
        } catch (error) { record('libreoffice', 'failed', message(error)); }
      }
    }
    if (scenario.oracles.includes('reference-layout')) record('reference-layout', 'blocked', 'No pinned reference layout oracle is configured.');
  }
  return results;
}

async function roundtrip(office: string, fixture: Fixture, directory: string, root: string, artifacts: Evidence['artifacts'][number][]) {
  const output = join(directory, 'libreoffice', fixture.name);
  await mkdir(output, { recursive: true });
  const profile = pathToFileURL(join(output, 'profile')).href;
  const result = await command([office, `-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'docx:Office Open XML Text', '--outdir', output, join(directory, `${fixture.name}.docx`)]);
  const log = join(output, 'consumer.log');
  await Bun.write(log, result.output);
  artifacts.push({ path: relative(root, log), sha256: sha256(result.output) });
  if (result.code !== 0) throw new Error(`LibreOffice failed (exit ${result.code}); see ${relative(root, log)}`);
  // LibreOffice can exit 0 without writing output. A missing package is a failure.
  const path = join(output, `${fixture.name}.docx`);
  const bytes = await readFile(path);
  artifacts.push({ path: relative(root, path), sha256: sha256(bytes) });
  fixture.verify(openWordArtifact(bytes));
}
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
