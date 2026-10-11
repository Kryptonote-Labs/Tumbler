import { describe, expect, test } from 'bun:test';
import { count, evaluate } from '../evaluate.ts';
import { dimensions, type Dimension, type Evidence, type Obligation, type Qualification, type ScenarioDefinition, type Topic } from '../model.ts';
import { topics, verifyInventory } from '../inventory.ts';
import { qualifications } from '../qualifications.ts';
import { scenarios } from '../scenarios.ts';

const topic: Topic = { id: 'spec:1', source: 'spec', section: '1', title: 'Test requirement', page: 1 };
const scenario: ScenarioDefinition = { id: 'case', title: 'Case', topics: [topic.id], dimensions: ['read'], oracles: ['assertion'] };
const passed: Evidence = { scenario: 'case', oracle: 'assertion', outcome: 'passed', detail: 'assertions', artifacts: [] };
function plan(dimension: Dimension = 'read', evidence: Obligation = { kind: 'required', criteria: 'All specified boundary and semantic cases.', evidence: [{ scenario: 'case', oracle: 'assertion' }] }): Qualification {
  return { topic: topic.id, rationale: 'Reviewed clause and applicability.', obligations: Object.fromEntries(dimensions.map(key => [key, key === dimension ? evidence : { kind: 'not-applicable', reason: 'This synthetic unit-test clause has no obligation in this dimension.' }])) as Record<Dimension, Obligation> };
}

describe('honest standards qualification', () => {
  test('the whole shipped inventory remains visible with no evidence', () => {
    expect(verifyInventory()).toMatch(/^[a-f0-9]{64}$/);
    const results = evaluate(topics, qualifications, scenarios, []);
    expect(results).toHaveLength(topics.length);
    expect(count(results.map(result => result.status))).toMatchObject({ total: topics.length, verified: 0, percent: 0 });
  });
  test('passing narrow examples do not qualify an unreviewed topic', () => {
    expect(evaluate([topic], [], [scenario], [passed])[0]?.status).toBe('unreviewed');
  });
  test('missing required evidence is untested, not passed', () => {
    expect(evaluate([topic], [plan()], [scenario], [])[0]?.status).toBe('untested');
  });
  test('unavailable dependencies receive no credit', () => {
    expect(evaluate([topic], [plan()], [scenario], [{ ...passed, outcome: 'blocked' }])[0]?.status).toBe('blocked');
  });
  test('all mandatory evidence must pass', () => {
    expect(evaluate([topic], [plan()], [scenario], [passed])[0]?.status).toBe('verified');
    expect(evaluate([topic], [plan()], [scenario], [{ ...passed, outcome: 'failed' }])[0]?.status).toBe('failed');
  });
  test('known failures defeat an unreviewed topic and cannot be hidden by omitting them from a plan', () => {
    const extra = { ...scenario, id: 'counterexample' };
    const failed = { ...passed, scenario: extra.id, outcome: 'failed' as const };
    expect(evaluate([topic], [], [extra], [failed])[0]?.status).toBe('failed');
    expect(evaluate([topic], [plan()], [scenario, extra], [passed, failed])[0]?.status).toBe('failed');
  });
  test('duplicates and unknown evidence cannot inflate the numerator', () => {
    expect(() => evaluate([topic, topic], [], [], [])).toThrow('Duplicate');
    expect(() => evaluate([topic], [], [scenario, scenario], [])).toThrow('Duplicate');
    expect(() => evaluate([topic], [plan(), plan()], [scenario], [])).toThrow('Duplicate');
    expect(() => evaluate([topic], [], [scenario], [passed, passed])).toThrow('Duplicate');
    expect(() => evaluate([topic], [], [], [passed])).toThrow('Undeclared');
    expect(() => evaluate([topic], [], [{ ...scenario, topics: ['unknown'] }], [])).toThrow('Unknown topic');
  });
  test('a schema check cannot qualify rendering or Word interoperability', () => {
    const sdk = { ...scenario, dimensions: ['render', 'interoperate'] as const, oracles: ['openxml'] as const };
    const obligation: Obligation = { kind: 'required', criteria: 'Invalid shortcut', evidence: [{ scenario: 'case', oracle: 'openxml' }] };
    expect(() => evaluate([topic], [plan('render', obligation)], [sdk], [])).toThrow('reference-layout');
    expect(() => evaluate([topic], [plan('interoperate', obligation)], [sdk], [])).toThrow('word');
  });
  test('applicability needs reasons and cannot remove a whole topic', () => {
    expect(() => evaluate([topic], [plan('read', { kind: 'not-applicable', reason: '' })], [scenario], [])).toThrow('Unjustified');
    expect(() => evaluate([topic], [plan('read', { kind: 'not-applicable', reason: 'Unsupported is not an exclusion' })], [scenario], [])).toThrow('Cannot remove topic');
  });
  test('evidence must belong to the topic and dimension it claims', () => {
    expect(() => evaluate([topic], [plan()], [{ ...scenario, dimensions: ['write'] }], [passed])).toThrow('does not cover');
  });
  test('denominators include untested and unreviewed work without subjective weights', () => {
    expect(count(['verified', 'unreviewed', 'untested', 'failed', 'blocked'])).toMatchObject({ total: 5, verified: 1, percent: 20 });
    expect(count([]).percent).toBeNull();
    expect(count(['not-applicable']).percent).toBeNull();
    expect(count(['verified', 'not-applicable']).percent).toBe(100);
    expect(count([...Array< 'verified' >(999).fill('verified'), 'untested']).percent).toBe(99.9);
  });
  test('schema failures do not masquerade as preservation failures', () => {
    const both = { ...scenario, dimensions: ['preserve', 'write'] as const, oracles: ['package-diff', 'openxml'] as const };
    const preservation = plan('preserve', { kind: 'required', criteria: 'Exact untouched payload comparison.', evidence: [{ scenario: 'case', oracle: 'package-diff' }] });
    const result = evaluate([topic], [preservation], [both], [
      { ...passed, oracle: 'package-diff' }, { ...passed, oracle: 'openxml', outcome: 'failed' },
    ])[0]!;
    expect(result.status).toBe('failed');
    expect(result.dimensions.preserve).toBe('verified');
    expect(result.dimensions.write).toBe('failed');
  });
  test('one missing mandatory case blocks qualification even when other cases pass', () => {
    const extra = { ...scenario, id: 'boundary' };
    const complete = plan('read', { kind: 'required', criteria: 'Normal and boundary cases.', evidence: [
      { scenario: 'case', oracle: 'assertion' }, { scenario: 'boundary', oracle: 'assertion' },
    ] });
    expect(evaluate([topic], [complete], [scenario, extra], [passed])[0]?.status).toBe('untested');
  });
  test('ordering evidence cannot change the score', () => {
    const extra = { ...scenario, id: 'second' };
    const evidence = [passed, { ...passed, scenario: extra.id }];
    expect(evaluate([topic], [plan()], [scenario, extra], evidence)).toEqual(evaluate([topic], [plan()], [scenario, extra], evidence.toReversed()));
  });
});
