import { expect, test } from 'bun:test';
import { formatComment, parseCommentData, type CommentData } from '../summary.ts';
import { dimensions } from '../model.ts';
import { matchesHead, newerComment } from '../comment.ts';

const sha = 'a'.repeat(40);
const hash = 'b'.repeat(64);
const data: CommentData = { schemaVersion: 3, commit: sha, contractHash: hash,
  inventory: { total: 1, mapped: 1, withoutRequirements: 0 },
  targets: dimensions.map(dimension => ({ id: `ecma-1:17.3/${dimension}`, dimension, status: 'verified', definitionHash: hash })) };
test('validates untrusted artifacts and rejects injected content and duplicate results', () => {
  expect(parseCommentData(data)).toEqual(data);
  expect(() => parseCommentData({ ...data, targets: [...data.targets, ...data.targets] })).toThrow();
  expect(() => parseCommentData({ ...data, targets: [{ ...data.targets[0], id: '<script>' }] })).toThrow();
  expect(() => parseCommentData({ ...data, inventory: { total: 1, mapped: 2, withoutRequirements: 0 } })).toThrow();
  expect(() => parseCommentData({ ...data, schemaVersion: 1 })).toThrow();
});
test('compares unchanged contracts, reports regressions and separates scope changes', () => {
  const base: CommentData = { ...data, targets: data.targets.map(item => ({ ...item, status: 'untested' })) };
  expect(formatComment(data, base)).toContain('+100.0000 pp');
  expect(formatComment(base, data)).toContain('6 lost verification');
  const changed = { ...data, targets: [{ ...data.targets[0]!, definitionHash: 'c'.repeat(64) }] };
  expect(formatComment(changed, base)).toContain('scope changed');
  expect(formatComment(changed, base)).toContain('0 newly verified');
  expect(formatComment(data)).toContain('not available');
  expect(formatComment(data, base)).toContain('| overall | 6 | 6 | 100.0000% |');
  expect(() => parseCommentData({ ...data, targets: data.targets.slice(1) })).toThrow();
});
test('does not post a stale commit, closed PR, or results from a different fork', () => {
  const run = { id: 1, run_attempt: 1, head_sha: sha, head_repository: { id: 42 }, event: 'pull_request' };
  const pr = { number: 50, state: 'open', head: { sha, repo: { id: 42 } }, base: { sha, repo: { full_name: 'Kryptonote-Labs/Tumbler' } } };
  expect(matchesHead(pr, run, 'Kryptonote-Labs/Tumbler')).toBe(true);
  expect(matchesHead({ ...pr, state: 'closed' }, run, 'Kryptonote-Labs/Tumbler')).toBe(false);
  expect(matchesHead(pr, { ...run, head_sha: 'd'.repeat(40) }, 'Kryptonote-Labs/Tumbler')).toBe(false);
  expect(matchesHead(pr, { ...run, head_repository: { id: 43 } }, 'Kryptonote-Labs/Tumbler')).toBe(false);
  expect(newerComment('<!-- word-run:2:1 -->', run)).toBe(true);
  expect(newerComment('<!-- word-run:1:2 -->', run)).toBe(true);
  expect(newerComment('<!-- word-run:1:1 -->', run)).toBe(false);
});
