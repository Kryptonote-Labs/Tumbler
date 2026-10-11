import { expect, test } from 'bun:test';
import { categories, everydayTasks } from '../everyday/catalog.ts';
import { evaluateEveryday } from '../everyday/evaluate.ts';
import { everydaySummary, everydayTable, parseEverydaySummary } from '../everyday/summary.ts';
import { requirements } from '../requirements.ts';
import { evaluate } from '../evaluate.ts';
import { topics } from '../inventory.ts';
import { scenarios } from '../scenarios.ts';

const empty = evaluate(topics, requirements, scenarios, []);
test('everyday inventory keeps all 42 tasks and all categories at zero without evidence', () => {
  const report = evaluateEveryday(empty);
  expect(report.overall).toMatchObject({ verified: 0, total: 42, untested: 42, percent: 0 });
  for (const category of categories) expect(report.categories[category]?.total).toBe(6);
});
test('shared evidence failure defeats passing checks; blocked and unmapped tasks earn no credit', () => {
  const task = everydayTasks.find(task => task.id === 'formatting.emphasis')!;
  const results = empty.map(item => ({ ...item, status: 'verified' as const }));
  expect(evaluateEveryday(results, [task]).overall.verified).toBe(1);
  for (const status of ['failed', 'blocked', 'untested'] as const) {
    const changed = results.map(item => item.id === 'edit.bold-range' ? { ...item, status } : item);
    expect(evaluateEveryday(changed, [task]).tasks[0]!.status).toBe(status);
  }
  expect(evaluateEveryday(results).overall.total).toBe(42);
  expect(evaluateEveryday(results).overall.untested).toBeGreaterThan(0);
  expect(() => evaluateEveryday(empty, [{ ...task, requirements: ['missing'] }])).toThrow();
  expect(() => evaluateEveryday(empty, [task, task])).toThrow();
});
test('comment artifact rejects missing, duplicate or injected tasks and distinguishes scope changes', () => {
  const summary = everydaySummary(evaluateEveryday(empty));
  expect(parseEverydaySummary(summary)).toEqual(summary);
  expect(() => parseEverydaySummary({ ...summary, tasks: summary.tasks.slice(1) })).toThrow();
  expect(() => parseEverydaySummary({ ...summary, tasks: summary.tasks.map((task, i) => i === 1 ? summary.tasks[0] : task) })).toThrow();
  expect(() => parseEverydaySummary({ ...summary, tasks: summary.tasks.map(task => ({ ...task, id: '<script>' })) })).toThrow();
  expect(everydayTable(summary, { ...summary, inventoryHash: 'b'.repeat(64) }).join('\n')).toContain('scope changed');
  expect(everydayTable(summary, summary).join('\n')).toContain('0.0000 pp');
});

test('task probes qualify only complete passes and retain failures over other passing evidence', () => {
  const task = everydayTasks.find(task => task.id === 'content.images')!;
  const probe = { id: task.id, status: 'verified' as const, detail: 'Executed', definitionHash: 'a'.repeat(64), artifacts: [] };
  expect(evaluateEveryday(empty, [task], [probe]).overall.verified).toBe(1);
  expect(evaluateEveryday(empty, [task], [{ ...probe, status: 'blocked' }]).overall.blocked).toBe(1);
  expect(evaluateEveryday(empty, [task], [{ ...probe, status: 'failed' }]).overall.failed).toBe(1);
  expect(() => evaluateEveryday(empty, [task], [probe, probe])).toThrow();
  expect(() => evaluateEveryday(empty, [task], [{ ...probe, id: 'missing' }])).toThrow();
  const mapped = everydayTasks.find(task => task.id === 'editing.history')!;
  const passed = empty.map(requirement => ({ ...requirement, status: 'verified' as const }));
  expect(evaluateEveryday(passed, [mapped], [{ ...probe, id: mapped.id, status: 'failed' }]).overall.failed).toBe(1);
});
