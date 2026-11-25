import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blankLatex, latexThesis } from '@tumblerjs/markdown/latex';
import { runTumbler } from '../src/index.ts';
import { latexFileHost } from '../src/latex-file-host.ts';
import { latexInspection, latexOperation } from '../src/latex-authoring.ts';
import { z } from 'zod';

test('the LaTeX CLI creates and edits the same thesis as the editor', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tumbler-latex-'));
  const path = join(dir, 'thesis.tex');
  await writeFile(path, blankLatex);
  try {
    let output = '';
    const run = (argv: string[], input?: z.input<typeof latexOperation>) =>
      runTumbler([path, 'latex', ...argv], {
        host: {
          ...latexFileHost,
          operate: async () => {
            throw new Error('Unexpected Word edit');
          },
          create: async () => {
            throw new Error('Unexpected document creation');
          },
          read: async () => {
            throw new Error('Unexpected Word read');
          },
        },
        readValue: async () => JSON.stringify(input),
        stdout: (text) => {
          output = text;
        },
        stderr: (text) => {
          output = text;
        },
      });
    async function inspect(offset = 0) {
      expect(await run(['inspect', '--offset', String(offset)])).toBe(0);
      return latexInspection.parse(JSON.parse(output));
    }
    const apply = (revision: string, operation: z.input<typeof latexOperation>) =>
      run(['apply', '--revision', revision, '--input', '-'], operation);

    const blank = await inspect();
    expect(await apply(blank.revision, { kind: 'thesis', title: 'Signal & Noise' })).toBe(0);
    const starter = latexThesis({ title: 'Signal & Noise' }).source;
    expect(await readFile(path, 'utf8')).toBe(starter);
    expect(starter).toContain('\\cleardoublepage\n\\pagenumbering{roman}');

    const thesis = await inspect();
    const contents = thesis.blocks.find((block) => block.kind === 'tableofcontents');
    const abstract = thesis.blocks.find((block) => block.kind === 'abstract');
    expect(contents).toMatchObject({ startsRight: false, numbering: { format: 'roman' } });
    expect(abstract).toBeDefined();
    expect(thesis.nextOffset).not.toBeNull();
    const rest = await inspect(thesis.nextOffset!);
    expect(rest.blocks[0]!.at).toBeGreaterThan(thesis.blocks.at(-1)!.at);

    expect(
      await apply(blank.revision, {
        kind: 'front-matter',
        block: 'tableofcontents',
        startsRight: true,
      }),
    ).toBe(1);
    expect(output).toContain('The LaTeX changed');
    expect(await readFile(path, 'utf8')).toBe(starter);
    expect(
      await apply(thesis.revision, { kind: 'page-numbering', at: abstract!.at, format: 'Roman' }),
    ).toBe(0);
    const numbered = await inspect();
    expect(
      await apply(numbered.revision, {
        kind: 'insert-page',
        at: numbered.blocks.find((block) => block.kind === 'tableofcontents')!.at,
        page: 'page',
        lines: ['For my readers', 'Thanks & gratitude'],
        contentsTitle: 'Dedication',
      }),
    ).toBe(0);
    const withPage = await inspect();
    expect(
      await apply(withPage.revision, {
        kind: 'front-matter',
        block: 'tableofcontents',
        startsRight: true,
      }),
    ).toBe(0);
    const source = await readFile(path, 'utf8');
    expect(source).toContain(String.raw`\addcontentsline{toc}{chapter}{Dedication}`);
    expect(source).toContain(String.raw`Thanks \& gratitude`);
    expect(source).toContain('\\cleardoublepage\n\\tableofcontents');
    expect(source.match(/\\cleardoublepage\n\\pagenumbering\{Roman\}/g)).toHaveLength(1);
    expect(source).toContain('\\cleardoublepage\n\\pagenumbering{arabic}');
    expect(source.slice(source.indexOf('\\chapter{Introduction}'))).toBe(
      starter.slice(starter.indexOf('\\chapter{Introduction}')),
    );
    const edited = await inspect();
    expect(await apply(edited.revision, { kind: 'thesis' })).toBe(1);
    expect(output).toContain('new blank LaTeX document');
    expect(await readFile(path, 'utf8')).toBe(source);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
