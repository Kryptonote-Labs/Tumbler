import { expect, test } from 'bun:test';
import { browserOutcomes } from '../everyday/browser-probes.ts';
const result = (status: string, error?: string) => ({ suites: [{ specs: [{ title: 'everyday:editing.typing', tests: [{ results: [{ status, ...(error ? { error: { message: error } } : {}) }] }] }] }] });
test('browser evidence distinguishes executed passes, failures, skipped tests and unavailable executables', () => {
  expect(browserOutcomes(result('passed')).get('editing.typing')?.status).toBe('verified');
  expect(browserOutcomes(result('failed', 'wrong exported text')).get('editing.typing')?.status).toBe('failed');
  expect(browserOutcomes(result('skipped')).get('editing.typing')?.status).toBe('blocked');
  expect(browserOutcomes(result('failed', "browserType.launch: Executable doesn't exist")).get('editing.typing')?.status).toBe('blocked');
  expect(browserOutcomes({ suites: [] }).size).toBe(0);
});
test('duplicate and retried browser results cannot silently count as a pass', () => {
  const duplicate = result('passed');
  duplicate.suites.push(duplicate.suites[0]!);
  expect(() => browserOutcomes(duplicate)).toThrow();
  const retry = result('passed');
  retry.suites[0]!.specs[0]!.tests[0]!.results.push({ status: 'failed' });
  expect(() => browserOutcomes(retry)).toThrow();
});

import { requiredProbes, requiredProbesPass } from '../everyday/required-probes.ts';
test('required task regressions and missing evidence fail the gate while known gaps stay visible', () => {
  const results = requiredProbes.map(id => ({ id, status: 'verified' as const, detail: '', definitionHash: '', artifacts: [] }));
  expect(requiredProbesPass(results)).toBe(true);
  expect(requiredProbesPass(results.slice(1))).toBe(false);
  expect(requiredProbesPass(results.map((result, index) => index === 0 ? { ...result, status: 'blocked' } : result))).toBe(false);
  expect(requiredProbesPass([...results, { id: 'editing.clipboard', status: 'failed', detail: 'lost formatting', definitionHash: '', artifacts: [] }])).toBe(true);
});
