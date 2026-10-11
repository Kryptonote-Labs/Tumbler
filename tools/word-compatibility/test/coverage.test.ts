import { expect, test } from 'bun:test';
import { coverage, type CoveragePlan } from '../coverage.ts';
import { topics } from '../inventory.ts';
import type { RequirementResult } from '../model.ts';

const topic = { id: 'example', source: 'ecma', section: '1', page: 1, title: 'Example' };
const requirement: RequirementResult = { id: 'read.example', dimension: 'read', title: 'Example', criteria: 'Read the example', topics: ['example'], checks: [], status: 'verified', definitionHash: 'a'.repeat(64) };
const plan: CoveragePlan = { topic: 'example', dimension: 'read', obligations: 'All applicable read obligations in this synthetic topic', requirements: ['read.example'] };
test('all 4482 topics stay in every dimension and overall counts all 26892 targets', () => {
  const result = coverage(topics, [], []);
  expect(result.overall.total).toBe(26892);
  expect(result.overall.percent).toBe(0);
  for (const value of Object.values(result.dimensions)) expect(value.untested).toBe(4482);
});
test('narrow passing requirements cannot qualify a whole topic', () => {
  expect(coverage([topic], [requirement], []).overall.verified).toBe(0);
  const qualified = coverage([topic], [requirement], [plan]);
  expect(qualified.overall.verified).toBe(1);
  expect(qualified.overall.total).toBe(6);
  expect(qualified.overall.percent).toBe(16.6666);
});
test('missing and blocked checks earn no credit and a linked failure cannot be omitted', () => {
  for (const status of ['untested', 'blocked', 'failed'] as const) {
    const result = coverage([topic], [{ ...requirement, status }], [plan]);
    expect(result.dimensions.read[status]).toBe(1);
    expect(result.overall.verified).toBe(0);
  }
  const failed = { ...requirement, id: 'read.counterexample', status: 'failed' as const };
  expect(coverage([topic], [requirement, failed], [plan]).dimensions.read.failed).toBe(1);
});
test('rejects missing, mismatched and duplicate coverage plans', () => {
  expect(() => coverage([topic], [], [plan])).toThrow();
  expect(() => coverage([topic], [requirement], [{ ...plan, dimension: 'write' }])).toThrow();
  expect(() => coverage([topic], [requirement], [plan, plan])).toThrow();
});
