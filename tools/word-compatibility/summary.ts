import { count } from './evaluate.ts';
import { dimensions, type CompatibilityReport, type Dimension, type Status } from './model.ts';

export interface CommentData {
  readonly schemaVersion: 2;
  readonly commit: string;
  readonly contractHash: string;
  readonly inventory: CompatibilityReport['inventory'];
  readonly requirements: readonly { readonly id: string; readonly dimension: Dimension; readonly status: Status; readonly definitionHash: string }[];
}
export function commentData(report: CompatibilityReport): CommentData {
  return { schemaVersion: 2, commit: report.provenance.commit, contractHash: report.contractHash, inventory: report.inventory,
    requirements: report.requirements.map(({ id, dimension, status, definitionHash }) => ({ id, dimension, status, definitionHash })) };
}

/** The privileged commenter reads only bounded, validated data, never PR-provided Markdown or code. */
export function parseCommentData(input: unknown): CommentData {
  if (!object(input) || input.schemaVersion !== 2 || !hex(input.commit, 40) || !hex(input.contractHash, 64) || !object(input.inventory) || !Array.isArray(input.requirements) || input.requirements.length > 10_000) throw new Error('Invalid compatibility summary');
  const { total, mapped, withoutRequirements } = input.inventory;
  if (!integer(total) || !integer(mapped) || !integer(withoutRequirements) || mapped + withoutRequirements !== total) throw new Error('Invalid inventory counts');
  const seen = new Set<string>();
  const requirements = input.requirements.map((item: unknown) => {
    if (!object(item) || typeof item.id !== 'string' || !/^[a-z0-9.-]{1,120}$/.test(item.id) || !dimension(item.dimension) || !status(item.status) || !hex(item.definitionHash, 64) || seen.has(item.id)) throw new Error('Invalid or duplicate requirement result');
    seen.add(item.id);
    return { id: item.id, dimension: item.dimension, status: item.status, definitionHash: item.definitionHash };
  });
  return { schemaVersion: 2, commit: input.commit, contractHash: input.contractHash, inventory: { total, mapped, withoutRequirements }, requirements };
}

export const commentMarker = '<!-- tumbler-word-compatibility -->';
export function formatComment(head: CommentData, base?: CommentData, runUrl?: string): string {
  const lines = [commentMarker, '**Word compatibility · LibreOffice reference**', '',
    'Percentages cover the explicit behaviour contract below, not every Word feature.', '',
    '| Dimension | Verified | Total | Percent | Δ vs base | Failed | Blocked | Untested |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const dimension of dimensions) {
    const current = head.requirements.filter(item => item.dimension === dimension);
    const previous = base?.requirements.filter(item => item.dimension === dimension);
    const value = count(current.map(item => item.status));
    const comparable = previous && previous.length === current.length && current.every(item => previous.some(other => other.id === item.id && other.definitionHash === item.definitionHash));
    const before = comparable ? count(previous.map(item => item.status)) : undefined;
    const delta = !base ? 'not available' : !comparable ? 'scope changed' : value.percent === null || before?.percent == null ? 'n/a' : signed(value.percent - before.percent);
    lines.push(`| ${dimension === 'interoperate' ? 'interoperate (LibreOffice)' : dimension} | ${value.verified} | ${value.total} | ${percent(value.percent)} | ${delta} | ${value.failed} | ${value.blocked} | ${value.untested} |`);
  }
  lines.push('', `Standards inventory: **${head.inventory.mapped}/${head.inventory.total} topics linked to requirements**; ${head.inventory.withoutRequirements} have none yet. A link does not mean a topic is fully covered.`);
  if (base) {
    const old = new Map(base.requirements.map(item => [item.id, item]));
    const comparable = head.requirements.filter(item => old.get(item.id)?.definitionHash === item.definitionHash);
    const gained = comparable.filter(item => item.status === 'verified' && old.get(item.id)?.status !== 'verified').length;
    const lost = comparable.filter(item => item.status !== 'verified' && old.get(item.id)?.status === 'verified').length;
    const added = head.requirements.filter(item => !old.has(item.id)).length;
    const removed = base.requirements.filter(item => !head.requirements.some(next => next.id === item.id)).length;
    const changed = head.requirements.filter(item => old.has(item.id) && old.get(item.id)?.definitionHash !== item.definitionHash).length;
    lines.push('', `Unchanged requirements: ${gained} newly verified, ${lost} lost verification. Contract changes: ${added} added, ${removed} removed, ${changed} changed.`);
  } else lines.push('', 'Base comparison is unavailable because the base has no compatible report.');
  if (runUrl) lines.push('', `[Full report and evidence artifacts](${runUrl}) · tested head \`${head.commit.slice(0, 12)}\``);
  lines.push('', 'Written on behalf of Alex by GPT-6 Astra');
  return lines.join('\n');
}
function percent(value: number | null) { return value === null ? 'n/a' : `${(Math.floor(value * 100) / 100).toFixed(2)}%`; }
function signed(value: number) { return `${value > 0 ? '+' : ''}${(Math.floor(value * 100) / 100).toFixed(2)} pp`; }
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function hex(value: unknown, length: number): value is string { return typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value); }
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000; }
function dimension(value: unknown): value is Dimension { return typeof value === 'string' && dimensions.some(item => item === value); }
function status(value: unknown): value is Status { return value === 'verified' || value === 'failed' || value === 'blocked' || value === 'untested'; }
