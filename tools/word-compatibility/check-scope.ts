import everydayLock from './everyday/lock.json';
import { evaluateEveryday } from './everyday/evaluate.ts';
import { requirements } from './requirements.ts';
import { command } from './process.ts';
import lock from './catalog/lock.json';
import { verifyInventory } from './inventory.ts';

verifyInventory();
const base = process.argv[2];
if (!base || !/^[a-f0-9]{40}$/.test(base)) throw new Error('Pass the full base commit SHA.');
const path = 'tools/word-compatibility/catalog/lock.json';
const files = await command(['git', 'ls-tree', '--name-only', base, '--', path]);
if (files.code !== 0) throw new Error(files.output);
if (files.output.trim()) {
  const previous = await command(['git', 'show', `${base}:${path}`]);
  if (previous.code !== 0) throw new Error(previous.output);
  const parsed: unknown = JSON.parse(previous.output);
  if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || typeof parsed.version !== 'number' || !('scope' in parsed) || !('files' in parsed)) throw new Error('Invalid baseline scope lock.');
  const changed = JSON.stringify(parsed.files) !== JSON.stringify(lock.files);
  if (changed && (lock.version <= parsed.version || lock.scope === parsed.scope)) throw new Error('Inventory changes require a higher scope version and a different scope ID. Explain additions/removals in the PR.');
  if (lock.version < parsed.version) throw new Error('Scope version cannot decrease.');
}
console.log(`Verified inventory integrity and scope history: ${lock.scope}`);

// Requirement mappings may grow within v1; changing task meaning/weight/denominator requires v2.
evaluateEveryday(requirements.map(requirement => ({ ...requirement, status: 'untested', definitionHash: 'unexecuted' })));
const everydayPath = 'tools/word-compatibility/everyday/lock.json';
const listed = await command(['git', 'ls-tree', '--name-only', base, '--', everydayPath]);
if (listed.code !== 0) throw new Error(listed.output);
if (listed.output.trim()) {
  const previous = await command(['git', 'show', `${base}:${everydayPath}`]);
  if (previous.code !== 0) throw new Error(previous.output);
  const parsed: unknown = JSON.parse(previous.output);
  if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || typeof parsed.version !== 'number' || !('inventoryHash' in parsed)) throw new Error('Invalid everyday baseline lock');
  if (everydayLock.version < parsed.version || parsed.inventoryHash !== everydayLock.inventoryHash && everydayLock.version <= parsed.version) throw new Error('Everyday task inventory changes require a higher benchmark version. Explain the change in the PR.');
}
console.log(`Verified everyday benchmark v${everydayLock.version}: ${everydayLock.total} tasks`);
