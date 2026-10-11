import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { count, evaluate, hashDefinition } from './evaluate.ts';
import { topics, sources, scope, verifyInventory } from './inventory.ts';
import { dimensions, type CompatibilityReport, type Counts } from './model.ts';
import { requirements } from './requirements.ts';
import { commentData } from './summary.ts';
import { command } from './process.ts';
import { html, markdown, percentage } from './report.ts';
import { runScenarios } from './runner.ts';
import { scenarios } from './scenarios.ts';

const { values } = parseArgs({ options: {
  output: { type: 'string' }, 'inventory-only': { type: 'boolean' },
  'require-openxml': { type: 'boolean' }, libreoffice: { type: 'boolean' },
  'require-libreoffice': { type: 'boolean' }, help: { type: 'boolean' },
}, strict: true });
if (values.help) {
  console.log('bun run compatibility:word -- [--output EMPTY_DIRECTORY] [--inventory-only] [--require-openxml] [--libreoffice] [--require-libreoffice]');
  process.exit(0);
}
if (values['inventory-only'] && (values['require-openxml'] || values['require-libreoffice'] || values.libreoffice)) throw new Error('Inventory-only mode cannot require or run external oracles.');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(values.output ?? join(root, 'compatibility-results', `word-${Date.now()}`));
await mkdir(output, { recursive: true });
if ((await readdir(output)).length) throw new Error('Use an empty output directory; stale consumer files must never count as evidence.');
const inventorySha256 = verifyInventory();
const fingerprint = await treeFingerprint();
const commit = await command(['git', '-C', root, 'rev-parse', 'HEAD']);
if (commit.code !== 0) throw new Error(commit.output);
const evidence = values['inventory-only'] ? [] : await runScenarios(scenarios, { root, output, libreoffice: !!(values.libreoffice || values['require-libreoffice']) });
if (await treeFingerprint() !== fingerprint) throw new Error('Source files changed during qualification. Rerun against one stable tree.');
const results = evaluate(topics, requirements, scenarios, evidence);
const mapped = new Set(requirements.flatMap(requirement => requirement.topics));
const report: CompatibilityReport = {
  schemaVersion: 2, scope: `${scope}/requirements-v1/libreoffice`, inventorySha256, contractHash: hashDefinition(requirements), provenance: {
    commit: commit.output.trim(), treeSha256: fingerprint, bun: Bun.version, platform: process.platform, arch: process.arch,
    dotnet: await versionLog('dotnet-version.log'), libreoffice: await versionLog('libreoffice-version.log'),
    openXmlSdk: (await readFile(join(root, 'tools/openxml-validator/OpenXmlValidator.csproj'), 'utf8')).match(/Include="DocumentFormat.OpenXml" Version="([^"]+)"/)?.[1] ?? 'unknown',
  },
  overall: count(results.map(requirement => requirement.status)),
  dimensions: Object.fromEntries(dimensions.map(dimension => [dimension, count(results.filter(requirement => requirement.dimension === dimension).map(requirement => requirement.status))])) as Record<typeof dimensions[number], Counts>,
  inventory: { total: topics.length, mapped: mapped.size, withoutRequirements: topics.length - mapped.size },
  sources: sources.map(source => ({ id: source.id, total: source.selectedLeafTopics, mapped: topics.filter(topic => topic.source === source.id && mapped.has(topic.id)).length })),
  requirements: results,
  scenarios: scenarios.map(({ run: _, ...definition }) => definition), evidence, topics,
};
await Bun.write(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await Bun.write(join(output, 'comment.json'), JSON.stringify(commentData(report), null, 2) + '\n');
await Bun.write(join(output, 'report.md'), markdown(report));
await Bun.write(join(output, 'report.html'), html(report));
console.log(`${percentage(report.overall)}: ${report.overall.verified}/${report.overall.total} explicit requirements verified against the current contract.`);
console.log(`${evidence.filter(item => item.outcome === 'passed').length} evidence checks passed; ${evidence.filter(item => item.outcome === 'failed').length} failed; ${evidence.filter(item => item.outcome === 'blocked').length} blocked.`);
console.log(`Reports and artifacts: ${output}`);
for (const item of evidence.filter(item => item.outcome === 'failed')) console.error(`${item.scenario}/${item.oracle}: ${item.detail}`);
const required = [values['require-openxml'] ? 'openxml' : undefined, values['require-libreoffice'] ? 'libreoffice' : undefined].filter(Boolean);
const unavailable = evidence.filter(item => required.includes(item.oracle) && item.outcome !== 'passed');
process.exitCode = evidence.some(item => item.outcome === 'failed') || unavailable.length ? 1 : 0;

/** Include uncommitted source, excluding ignored artifacts/dependencies; commit alone is insufficient. */
async function treeFingerprint(): Promise<string> {
  const listed = await command(['git', '-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  if (listed.code !== 0) throw new Error(listed.output);
  const hash = createHash('sha256');
  for (const name of [...new Set(listed.output.split('\0').filter(Boolean))].sort()) {
    // Deleted tracked files are part of the source state too.
    const bytes = await readFile(join(root, name)).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    });
    hash.update(name).update('\0').update(bytes === null ? 'deleted' : String(bytes.length)).update('\0');
    if (bytes) hash.update(bytes);
  }
  return hash.digest('hex');
}

async function versionLog(name: string): Promise<string | null> {
  const file = Bun.file(join(output, name));
  return await file.exists() ? (await file.text()).trim() : null;
}
