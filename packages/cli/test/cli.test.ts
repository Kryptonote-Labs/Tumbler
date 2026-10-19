import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWordArtifact, openWordArtifact, importWordContent } from '@tumblerjs/word';
import { runTumbler } from '../src/index.ts';
import { createFileHost } from '../src/file-host.ts';

const host = createFileHost();
async function run(args: string[]) {
  let stdout = '';
  let stderr = '';
  const code = await runTumbler(args, {
    host,
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  return { code, stdout, stderr };
}
test('real DOCX formatting, replacement, stale handles and preservation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tumbler-cli-'));
  const path = join(directory, 'document.docx');
  try {
    writeFileSync(
      path,
      createWordArtifact({
        paragraphs: [
          { runs: [{ text: 'the draft report', format: { italic: true } }] },
          { runs: [{ text: 'untouched' }] },
        ],
      }).bytes(),
    );
    const read = JSON.parse((await run([path, 'read'])).stdout);
    const formatted = await run([
      path,
      'format',
      '--page',
      read.page,
      '--find',
      'draft',
      '--strike',
    ]);
    expect(formatted.code).toBe(0);
    const blocks = importWordContent(openWordArtifact(readFileSync(path)));
    expect(blocks[0]?.kind).toBe('paragraph');
    if (blocks[0]?.kind !== 'paragraph') throw new Error('Expected paragraph');
    expect(blocks[0].runs.find((run) => run.text === 'draft')?.format).toMatchObject({
      strike: true,
      italic: true,
    });
    const staleBytes = readFileSync(path);
    expect(
      (await run([path, 'replace', '--page', read.page, '--find', 'draft', '--value', 'final']))
        .stderr,
    ).toContain('changed');
    expect(readFileSync(path)).toEqual(staleBytes);
    const fresh = JSON.parse(formatted.stdout).page;
    const replaced = await run([
      path,
      'replace',
      '--page',
      fresh.page,
      '--find',
      'draft',
      '--value',
      'final',
    ]);
    expect(replaced.code).toBe(0);
    expect(JSON.parse(replaced.stdout).page.text).toBe('the final report\nuntouched\n');
    const cleared = await run([
      path,
      'format',
      '--page',
      JSON.parse(replaced.stdout).page.page,
      '--find',
      'final',
      '--strike=null',
      '--font-size',
      '900',
    ]);
    expect(cleared.code).toBe(0);
    const formattedRun = JSON.parse(cleared.stdout).page.runs.find(
      (run: { text: string }) => run.text === 'final',
    );
    expect(formattedRun.attributes).toMatchObject({
      strike: false,
      italic: true,
      fontSizePoints: 900,
    });
    expect((await run([path, 'format', '--find', 'final', '--strike'])).stderr).toContain(
      'Read first',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('ambiguous targets, unknown flags, mixed selectors and existing creation never write', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tumbler-cli-'));
  const path = join(directory, 'document.docx');
  try {
    writeFileSync(
      path,
      createWordArtifact({ paragraphs: [{ runs: [{ text: 'draft and draft' }] }] }).bytes(),
    );
    const original = readFileSync(path);
    const read = JSON.parse((await run([path, 'read'])).stdout);
    for (const args of [
      [path, 'format', '--page', read.page, '--find', 'draft', '--strike'],
      [path, 'format', '--page', read.page, '--find', 'draft', '--strkie'],
      [path, 'format', '--page', read.page, '--find', 'draft', '--start', '0', '--strike'],
      ['create', path],
    ]) {
      expect((await run(args)).code).toBe(1);
      expect(readFileSync(path)).toEqual(original);
    }
    expect(
      (
        await run([
          path,
          'format',
          '--page',
          read.page,
          '--find',
          'draft',
          '--within',
          'and draft',
          '--strike=false',
        ])
      ).code,
    ).toBe(0);
    expect((await run(['create', join(directory, 'new.docx')])).code).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
