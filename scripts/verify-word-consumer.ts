import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Install packed packages outside the monorepo so workspace dependencies cannot hide peer/type leaks.
const root = resolve(import.meta.dir, '..');
const temporary = await mkdtemp(join(tmpdir(), 'tumbler-word-consumer-'));
const example = join(temporary, 'react-word');
await cp(join(root, 'examples/react-word'), example, { recursive: true, filter: path => !path.includes('node_modules') && !path.includes('/dist') });
async function run(cmd: string[], cwd: string) {
  const child = Bun.spawn(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' });
  if (await child.exited !== 0) throw new Error(`${cmd.join(' ')} failed in ${cwd}`);
}
const overrides: Record<string, string> = {};
for (const name of ['opc', 'ooxml', 'formulas', 'charts', 'ink', 'core', 'word']) {
  const directory = join(root, 'packages', name);
  const manifest: { name: string; version: string } = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const tarball = join(temporary, `${name}.tgz`);
  await run(['bun', 'pm', 'pack', '--filename', tarball, '--quiet'], directory);
  overrides[manifest.name] = `file:${tarball}`;
}
const path = join(example, 'package.json');
const manifest = JSON.parse(await readFile(path, 'utf8'));
manifest.dependencies['@tumblerjs/word'] = overrides['@tumblerjs/word'];
manifest.overrides = overrides;
await writeFile(path, JSON.stringify(manifest, null, 2));
await run(['bun', 'install'], example);
// Bun may automatically install optional peers; remove Yjs to test that it is truly optional.
await import('node:fs/promises').then(({ rm }) => rm(join(example, 'node_modules/yjs'), { recursive: true, force: true }));
await run(['bun', 'run', 'check'], example);
await run(['bun', 'run', 'build'], example);
console.log(`Verified React consumer without Yjs: ${example}`);
if (process.argv.includes('--browser') || process.argv.includes('--firefox')) {
  const { verifyWordReactBrowser } = await import('./verify-word-react-browser.ts');
  if (process.argv.includes('--browser')) await verifyWordReactBrowser(example);
  if (process.argv.includes('--firefox')) {
    const executablePath = process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE;
    await verifyWordReactBrowser(example, 'firefox', { headless: true, ...(executablePath ? { executablePath } : {}) });
  }
}
