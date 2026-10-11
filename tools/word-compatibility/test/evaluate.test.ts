import { expect, test } from 'bun:test';
import { count, evaluate } from '../evaluate.ts';
import type { Evidence, Requirement, ScenarioDefinition, Topic } from '../model.ts';
import { topics, verifyInventory } from '../inventory.ts';
import { requirements } from '../requirements.ts';
import { scenarios } from '../scenarios.ts';
const topic: Topic = { id: 'spec:1', source: 'spec', section: '1', title: 'Topic', page: 1 };
const scenario: ScenarioDefinition = { id: 'case', title: 'Case', topics: [topic.id], dimensions: ['read', 'interoperate', 'render'], oracles: ['assertion', 'libreoffice', 'openxml'] };
const requirement: Requirement = { id: 'read.case', dimension: 'read', title: 'Literal text', criteria: 'Retain the specified literal text.', topics: [topic.id], checks: [{ scenario: 'case', oracle: 'assertion' }] };
const passed: Evidence = { scenario: 'case', oracle: 'assertion', outcome: 'passed', detail: 'assertions', artifacts: [] };
const run = (items: readonly Evidence[]) => evaluate([topic], [requirement], [scenario], items)[0]!.status;

test('unimplemented requirements stay in their applicable dimension denominator', () => {
  expect(verifyInventory()).toMatch(/^[a-f0-9]{64}$/);
  const results = evaluate(topics, requirements, scenarios, []);
  expect(results).toHaveLength(requirements.length);
  expect(count(results.map(item => item.status))).toMatchObject({ total: requirements.length, verified: 0, untested: requirements.length, percent: 0 });
});
test('explicit requirements earn credit from evidence without a manual clause qualification', () => {
  expect(run([passed])).toBe('verified');
  expect(run([])).toBe('untested');
  expect(run([{ ...passed, outcome: 'blocked' }])).toBe('blocked');
  expect(run([{ ...passed, outcome: 'failed' }])).toBe('failed');
});
test('requirements with no executable checks earn no credit', () => {
  expect(evaluate([topic], [{ ...requirement, checks: [] }], [scenario], [passed])[0]?.status).toBe('untested');
});
test('every mandatory check must pass, and failure wins over missing evidence', () => {
  const second = { ...scenario, id: 'boundary' };
  const complete = { ...requirement, checks: [...requirement.checks, { scenario: second.id, oracle: 'assertion' as const }] };
  expect(evaluate([topic], [complete], [scenario, second], [passed])[0]?.status).toBe('untested');
  expect(evaluate([topic], [complete], [scenario, second], [{ ...passed, outcome: 'failed' }])[0]?.status).toBe('failed');
});
test('LibreOffice evidence qualifies current interoperability, SDK evidence cannot substitute', () => {
  const interoperate = { ...requirement, id: 'interoperate.case', dimension: 'interoperate' as const, checks: [{ scenario: 'case', oracle: 'libreoffice' as const }] };
  expect(evaluate([topic], [interoperate], [scenario], [{ ...passed, oracle: 'libreoffice' }])[0]?.status).toBe('verified');
  expect(() => evaluate([topic], [{ ...interoperate, checks: [{ scenario: 'case', oracle: 'openxml' }] }], [scenario], [])).toThrow('libreoffice');
  expect(() => evaluate([topic], [{ ...interoperate, dimension: 'render' }], [scenario], [])).toThrow('reference-layout');
});
test('unknown and duplicate results cannot inflate the numerator', () => {
  expect(() => evaluate([topic, topic], [], [], [])).toThrow('Duplicate');
  expect(() => evaluate([topic], [requirement, requirement], [scenario], [])).toThrow('Duplicate');
  expect(() => evaluate([topic], [requirement], [scenario, scenario], [])).toThrow('Duplicate');
  expect(() => run([passed, passed])).toThrow('Duplicate');
  expect(() => evaluate([topic], [], [], [passed])).toThrow('Undeclared');
  expect(() => evaluate([topic], [{ ...requirement, topics: ['unknown'] }], [scenario], [])).toThrow('Unknown topic');
});
test('evidence must target the right dimension and source topic', () => {
  expect(() => evaluate([topic], [requirement], [{ ...scenario, dimensions: ['write'] }], [passed])).toThrow('does not cover');
});
test('empty denominator is not 100%, and untested requirements count', () => {
  expect(count([]).percent).toBeNull();
  expect(count(['verified', 'untested', 'blocked', 'failed'])).toMatchObject({ total: 4, verified: 1, percent: 25 });
});
test('changing criteria changes the definition hash and prevents false base deltas', () => {
  const a = evaluate([topic], [requirement], [scenario], [passed])[0]!;
  const b = evaluate([topic], [{ ...requirement, criteria: 'A different obligation.' }], [scenario], [passed])[0]!;
  expect(a.definitionHash).not.toBe(b.definitionHash);
});
