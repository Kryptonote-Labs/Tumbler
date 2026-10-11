import { count } from '../evaluate.ts';
import type { Status } from '../model.ts';
import { categories, everydayTasks, type Category } from './catalog.ts';
import type { EverydayReport } from './evaluate.ts';
export interface EverydaySummary {
  readonly version: 1;
  readonly inventoryHash: string;
  readonly contractHash: string;
  readonly tasks: readonly { readonly id: string; readonly category: Category; readonly status: Status; readonly definitionHash: string }[];
}
export function everydaySummary(report: EverydayReport): EverydaySummary {
  return { version: 1, inventoryHash: report.inventoryHash, contractHash: report.contractHash,
    tasks: report.tasks.map(({ id, category, status, definitionHash }) => ({ id, category, status, definitionHash })) };
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function parseEverydaySummary(value: unknown): EverydaySummary {
  if (!object(value) || value.version !== 1 || !hash(value.inventoryHash) || !hash(value.contractHash) || !Array.isArray(value.tasks) || value.tasks.length !== everydayTasks.length) throw new Error('Invalid everyday summary');
  const seen = new Set<string>();
  const tasks = value.tasks.map((task: unknown) => {
    if (!object(task) || typeof task.id !== 'string' || seen.has(task.id) || !hash(task.definitionHash)) throw new Error('Invalid everyday task');
    const definition = everydayTasks.find(item => item.id === task.id);
    if (!definition || definition.category !== task.category || !['verified', 'failed', 'blocked', 'untested'].includes(String(task.status))) throw new Error('Invalid everyday task status/category');
    seen.add(task.id);
    return { id: task.id, category: definition.category, status: task.status as Status, definitionHash: task.definitionHash };
  });
  return { version: 1, inventoryHash: value.inventoryHash, contractHash: value.contractHash, tasks };
}
export function everydayTable(head: EverydaySummary, base?: EverydaySummary): string[] {
  const rows = ['', '**Everyday document benchmark · v1**', '',
    'Equal-weight tasks, not estimated market coverage. Untested tasks earn no credit. Includes headless and browser tasks; passing headless checks does not prove the UI works.', '',
    '| Category | Verified | Total | Percent | Δ vs base | Failed | Blocked | Untested |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const category of ['overall', ...categories] as const) {
    const tasks = head.tasks.filter(task => category === 'overall' || task.category === category);
    const previous = base?.tasks.filter(task => category === 'overall' || task.category === category);
    const comparable = previous && head.inventoryHash === base?.inventoryHash && previous.length === tasks.length && tasks.every(task => previous.some(old => old.id === task.id && old.definitionHash === task.definitionHash));
    const current = count(tasks.map(task => task.status));
    const old = comparable ? count(previous.map(task => task.status)) : undefined;
    const delta = !base ? 'not available' : !comparable ? 'scope changed' : `${((current.percent ?? 0) - (old?.percent ?? 0)).toFixed(4)} pp`;
    rows.push(`| ${category} | ${current.verified} | ${current.total} | ${(current.percent ?? 0).toFixed(4)}% | ${delta} | ${current.failed} | ${current.blocked} | ${current.untested} |`);
  }
  return rows;
}
