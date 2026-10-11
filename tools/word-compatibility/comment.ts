import { join } from 'node:path';
import { commentMarker, formatComment, parseCommentData, type CommentData } from './summary.ts';

interface PullRequest {
  number: number;
  state: string;
  head: { sha: string; repo: { id: number } | null };
  base: { sha: string; repo: { full_name: string } };
}
interface Run { id: number; run_attempt: number; head_sha: string; head_repository: { id: number }; event: string }
interface Comment { id: number; body: string; user: { login: string } }

export function matchesHead(pr: PullRequest, run: Run, repository: string): boolean {
  return pr.state === 'open' && pr.head.sha === run.head_sha && pr.head.repo?.id === run.head_repository.id && pr.base.repo.full_name === repository;
}
export function newerComment(body: string, run: Pick<Run, 'id' | 'run_attempt'>): boolean {
  const match = body.match(/<!-- word-run:(\d+):(\d+) -->/);
  return !!match && (Number(match[1]) > run.id || (Number(match[1]) === run.id && Number(match[2]) > run.run_attempt));
}

/** Runs from the default branch. Artifacts are bounded data, never executable code or Markdown. */
async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const directory = process.env.WORD_ARTIFACTS;
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository) || !token || !eventPath || !directory) throw new Error('Missing GitHub commenter environment');
  const event = await Bun.file(eventPath).json() as { workflow_run: Run };
  const run = event.workflow_run;
  if (run.event !== 'pull_request' || !/^[a-f0-9]{40}$/.test(run.head_sha) || !Number.isSafeInteger(run.id) || !Number.isSafeInteger(run.run_attempt)) throw new Error('Invalid workflow run');
  async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: ${response.status}`);
    return await response.json() as T;
  }
  async function artifact(revision: string): Promise<CommentData | undefined> {
    const file = Bun.file(join(directory!, `word-compatibility-${revision}`, 'comment.json'));
    if (!await file.exists()) return undefined;
    if (file.size > 20_000_000) throw new Error('Compatibility artifact exceeds size limit');
    const data: unknown = await file.json();
    if (revision === 'base' && data !== null && typeof data === 'object' && 'schemaVersion' in data && data.schemaVersion !== 3) return undefined;
    return parseCommentData(data);
  }
  const head = await artifact('head');
  const base = await artifact('base');
  if (head && head.commit !== run.head_sha) throw new Error('Report does not belong to this workflow head');
  const candidates = await api<PullRequest[]>(`commits/${run.head_sha}/pulls?per_page=100`);
  for (const candidate of candidates) {
    const pr = await api<PullRequest>(`pulls/${candidate.number}`);
    if (!matchesHead(pr, run, repository)) continue;
    const runUrl = `https://github.com/${repository}/actions/runs/${run.id}`;
    const body = head ? formatComment(head, base?.commit === pr.base.sha ? base : undefined, runUrl)
      : `${commentMarker}\n**Word compatibility: no report produced for this head.**\n\n[Inspect the failed or cancelled run](${runUrl}). Previous results do not apply.\n\nWritten on behalf of Alex by GPT-6 Astra`;
    let existing: Comment | undefined;
    for (let page = 1; ; page++) {
      const comments = await api<Comment[]>(`issues/${pr.number}/comments?per_page=100&page=${page}`);
      existing = comments.find(comment => comment.user.login === 'github-actions[bot]' && comment.body.includes(commentMarker)) ?? existing;
      if (comments.length < 100) break;
    }
    if (existing && newerComment(existing.body, run)) continue;
    // Recheck after downloading/listing; a pushed commit invalidates this run.
    if (!matchesHead(await api<PullRequest>(`pulls/${pr.number}`), run, repository)) continue;
    const payload = { body: `${body}\n\n<!-- word-run:${run.id}:${run.run_attempt} -->` };
    if (existing) await api(`issues/comments/${existing.id}`, 'PATCH', payload);
    else await api(`issues/${pr.number}/comments`, 'POST', payload);
  }
}
if (import.meta.main) await main();
