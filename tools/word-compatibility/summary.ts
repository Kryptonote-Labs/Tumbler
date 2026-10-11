import { count } from './evaluate.ts';
import { dimensions, type CompatibilityReport, type Dimension, type Status } from './model.ts';

export interface CommentData {
  readonly schemaVersion: 3;
  readonly commit: string;
  readonly contractHash: string;
  readonly inventory: CompatibilityReport['inventory'];
  readonly targets: readonly { readonly id: string; readonly dimension: Dimension; readonly status: Status; readonly definitionHash: string }[];
}
export function commentData(report: CompatibilityReport): CommentData {
  return { schemaVersion: 3, commit: report.provenance.commit, contractHash: report.contractHash, inventory: report.inventory,
    targets: report.coverageTargets.map(({ id, dimension, status, definitionHash }) => ({ id, dimension, status, definitionHash })) };
}

/** The privileged commenter reads only bounded, validated data, never PR-provided Markdown or code. */
export function parseCommentData(input: unknown): CommentData {
  if (!object(input) || input.schemaVersion !== 3 || !hex(input.commit, 40) || !hex(input.contractHash, 64) || !object(input.inventory) || !Array.isArray(input.targets) || input.targets.length > 100_000) throw new Error('Invalid compatibility summary');
  const { total, mapped, withoutRequirements } = input.inventory;
  if (!integer(total) || !integer(mapped) || !integer(withoutRequirements) || mapped + withoutRequirements !== total) throw new Error('Invalid inventory counts');
  const seen = new Set<string>();
  const topicDimensions = new Map<string, Set<string>>();
  const targets = input.targets.map((item: unknown) => {
    if (!object(item) || typeof item.id !== 'string' || !/^[a-z0-9.:/\-]{1,160}$/.test(item.id) || !dimension(item.dimension) || !status(item.status) || !hex(item.definitionHash, 64) || seen.has(item.id)) throw new Error('Invalid or duplicate requirement result');
    seen.add(item.id);
    const suffix = `/${item.dimension}`;
    if (!item.id.endsWith(suffix)) throw new Error('Target dimension mismatch');
    const topic = item.id.slice(0, -suffix.length);
    const covered = topicDimensions.get(topic) ?? new Set<string>();
    covered.add(item.dimension);
    topicDimensions.set(topic, covered);
    return { id: item.id, dimension: item.dimension, status: item.status, definitionHash: item.definitionHash };
  });
  if (topicDimensions.size !== total || [...topicDimensions.values()].some(items => items.size !== dimensions.length) || targets.length !== total * dimensions.length || dimensions.some(d => targets.filter(item => item.dimension === d).length !== total)) throw new Error('Incomplete standards matrix');
  return { schemaVersion: 3, commit: input.commit, contractHash: input.contractHash, inventory: { total, mapped, withoutRequirements }, targets };
}

export const commentMarker = '<!-- tumbler-word-compatibility -->';
export function formatComment(head: CommentData, base?: CommentData, runUrl?: string): string {
  const lines = [commentMarker, '**Word compatibility · LibreOffice reference**', '',
    'Overall compatibility = verified standards topic/dimension targets ÷ all targets. LibreOffice supplies interoperability evidence; this is standards coverage, not a prediction for arbitrary files.', '',
    '| Dimension | Verified | Total | Percent | Δ vs base | Failed | Blocked | Untested |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const dimension of ['overall', ...dimensions] as const) {
    const current = head.targets.filter(item => dimension === 'overall' || item.dimension === dimension);
    const previous = base?.targets.filter(item => dimension === 'overall' || item.dimension === dimension);
    const value = count(current.map(item => item.status));
    const oldDefinitions = new Map(previous?.map(item => [item.id, item.definitionHash]));
    const comparable = previous && previous.length === current.length && current.every(item => oldDefinitions.get(item.id) === item.definitionHash);
    const before = comparable ? count(previous.map(item => item.status)) : undefined;
    const delta = !base ? 'not available' : !comparable ? 'scope changed' : value.percent === null || before?.percent == null ? 'n/a' : signed(value.percent - before.percent);
    lines.push(`| ${dimension === 'interoperate' ? 'interoperate (LibreOffice)' : dimension} | ${value.verified} | ${value.total} | ${percent(value.percent)} | ${delta} | ${value.failed} | ${value.blocked} | ${value.untested} |`);
  }
  lines.push('', `Standards inventory: **${head.inventory.mapped}/${head.inventory.total} topics linked to narrow requirements**; ${head.inventory.withoutRequirements} have none yet. A link earns no topic coverage by itself. Untested includes topics still awaiting full requirement decomposition.`);
  if (base) {
    const old = new Map(base.targets.map(item => [item.id, item]));
    const comparable = head.targets.filter(item => old.get(item.id)?.definitionHash === item.definitionHash);
    const gained = comparable.filter(item => item.status === 'verified' && old.get(item.id)?.status !== 'verified').length;
    const lost = comparable.filter(item => item.status !== 'verified' && old.get(item.id)?.status === 'verified').length;
    const added = head.targets.filter(item => !old.has(item.id)).length;
    const currentIds = new Set(head.targets.map(item => item.id));
    const removed = base.targets.filter(item => !currentIds.has(item.id)).length;
    const changed = head.targets.filter(item => old.has(item.id) && old.get(item.id)?.definitionHash !== item.definitionHash).length;
    lines.push('', `Unchanged targets: ${gained} newly verified, ${lost} lost verification. Target definition changes: ${added} added, ${removed} removed, ${changed} changed.`);
  } else lines.push('', 'Base comparison is unavailable because the base has no compatible report.');
  if (runUrl) lines.push('', `[Full report and evidence artifacts](${runUrl}) · tested head \`${head.commit.slice(0, 12)}\``);
  lines.push('', 'Written on behalf of Alex by GPT-6 Astra');
  return lines.join('\n');
}
function percent(value: number | null) { return value === null ? 'n/a' : `${(Math.floor(value * 10000) / 10000).toFixed(4)}%`; }
function signed(value: number) { return `${value > 0 ? '+' : ''}${(Math.floor(value * 10000) / 10000).toFixed(4)} pp`; }
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function hex(value: unknown, length: number): value is string { return typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value); }
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000; }
function dimension(value: unknown): value is Dimension { return typeof value === 'string' && dimensions.some(item => item === value); }
function status(value: unknown): value is Status { return value === 'verified' || value === 'failed' || value === 'blocked' || value === 'untested'; }
