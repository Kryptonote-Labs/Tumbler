import type { TaskProbe } from './probe-model.ts';
import lock from './lock.json';
import { count, hashDefinition } from '../evaluate.ts';
import type { RequirementResult, Status } from '../model.ts';
import { categories, everydayTasks, type EverydayTask } from './catalog.ts';

export function evaluateEveryday(requirements: readonly RequirementResult[], tasks: readonly EverydayTask[] = everydayTasks, probes: readonly TaskProbe[] = []) {
  const inventoryHash = hashDefinition(tasks.map(({ requirements: _, ...task }) => task));
  if (tasks === everydayTasks && (lock.version !== 1 || lock.total !== tasks.length || lock.inventoryHash !== inventoryHash)) throw new Error('Everyday inventory differs from its versioned lock');
  const probeMap = new Map<string, TaskProbe>();
  for (const probe of probes) {
    if (!tasks.some(task => task.id === probe.id) || probeMap.has(probe.id) || !['verified', 'failed', 'blocked'].includes(probe.status)) throw new Error(`Invalid task probe ${probe.id}`);
    probeMap.set(probe.id, probe);
  }
  const seen = new Set<string>();
  const results = tasks.map(task => {
    if (seen.has(task.id) || !categories.includes(task.category) || !task.criteria.trim()) throw new Error(`Invalid everyday task ${task.id}`);
    seen.add(task.id);
    const evidence = task.requirements.map(id => {
      const found = requirements.find(requirement => requirement.id === id);
      if (!found) throw new Error(`Unknown everyday requirement ${id}`);
      return found;
    });
    const probe = probeMap.get(task.id);
    const statuses = [...evidence.map(item => item.status), ...(probe ? [probe.status] : [])];
    const status: Status = statuses.includes('failed') ? 'failed'
      : !statuses.length || statuses.includes('untested') ? 'untested'
      : statuses.includes('blocked') ? 'blocked' : 'verified';
    return { ...task, status, ...(probe ? { probe } : {}), definitionHash: hashDefinition({ task, requirements: evidence.map(item => item.definitionHash), ...(probe ? { probe: probe.definitionHash } : {}) }) };
  });
  return { version: 1 as const, inventoryHash,
    contractHash: hashDefinition(results.map(task => task.definitionHash)),
    overall: count(results.map(task => task.status)),
    categories: Object.fromEntries(categories.map(category => [category, count(results.filter(task => task.category === category).map(task => task.status))])), tasks: results };
}
export type EverydayReport = ReturnType<typeof evaluateEveryday>;
