import lock from './lock.json';
import { count, hashDefinition } from '../evaluate.ts';
import type { RequirementResult, Status } from '../model.ts';
import { categories, everydayTasks, type EverydayTask } from './catalog.ts';

export function evaluateEveryday(requirements: readonly RequirementResult[], tasks: readonly EverydayTask[] = everydayTasks) {
  const inventoryHash = hashDefinition(tasks.map(({ requirements: _, ...task }) => task));
  if (tasks === everydayTasks && (lock.version !== 1 || lock.total !== tasks.length || lock.inventoryHash !== inventoryHash)) throw new Error('Everyday inventory differs from its versioned lock');
  const seen = new Set<string>();
  const results = tasks.map(task => {
    if (seen.has(task.id) || !categories.includes(task.category) || !task.criteria.trim()) throw new Error(`Invalid everyday task ${task.id}`);
    seen.add(task.id);
    const evidence = task.requirements.map(id => {
      const found = requirements.find(requirement => requirement.id === id);
      if (!found) throw new Error(`Unknown everyday requirement ${id}`);
      return found;
    });
    const status: Status = evidence.some(item => item.status === 'failed') ? 'failed'
      : !evidence.length || evidence.some(item => item.status === 'untested') ? 'untested'
      : evidence.some(item => item.status === 'blocked') ? 'blocked' : 'verified';
    return { ...task, status, definitionHash: hashDefinition({ task, requirements: evidence.map(item => item.definitionHash) }) };
  });
  return { version: 1 as const, inventoryHash,
    contractHash: hashDefinition(results.map(task => task.definitionHash)),
    overall: count(results.map(task => task.status)),
    categories: Object.fromEntries(categories.map(category => [category, count(results.filter(task => task.category === category).map(task => task.status))])), tasks: results };
}
export type EverydayReport = ReturnType<typeof evaluateEveryday>;
