import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { parseLatex, serializeLatex } from '@tumblerjs/markdown/latex';
import { authorLatexDocument, inspectLatexDocument } from './latex-authoring.ts';
import { editLatexSource, readLatexSource, type LatexOperationHost } from './latex.ts';

const revisionOf = (source: Uint8Array) => createHash('sha256').update(source).digest('hex');
function checkPath(path: string) {
  if (extname(path).toLowerCase() !== '.tex') throw new Error('Use a .tex document.');
}
function decode(input: Uint8Array) {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input);
}

export const latexFileHost = {
  async readLatex(path, offset) {
    checkPath(path);
    const input = await readFile(path);
    return readLatexSource(decode(input), revisionOf(input), offset);
  },
  async inspectLatex(path, offset) {
    checkPath(path);
    const input = await readFile(path);
    return inspectLatexDocument(parseLatex(decode(input)), revisionOf(input), offset);
  },
  async editLatex(path, edit) {
    checkPath(path);
    const file = await realpath(path);
    const lock = file + '.tumbler-lock';
    const handle = await open(lock, 'wx');
    const temporary = file + '.tumbler-' + randomUUID();
    try {
      const input = await readFile(file);
      if (revisionOf(input) !== edit.revision)
        throw new Error('The LaTeX changed. Read its latest revision.');
      const source = decode(input);
      const updated = edit.kind === 'apply'
        ? serializeLatex(authorLatexDocument(parseLatex(source), edit.operation).doc)
        : editLatexSource(source, edit);
      const output = Buffer.from(updated, 'utf8');
      if (!input.equals(output)) {
        await writeFile(temporary, output, { flag: 'wx', mode: (await stat(file)).mode });
        if (revisionOf(await readFile(file)) !== edit.revision)
          throw new Error('The LaTeX changed. Read its latest revision.');
        await rename(temporary, file);
      }
      return { revision: revisionOf(output) };
    } finally {
      await unlink(temporary).catch(() => {});
      await handle.close();
      await unlink(lock);
    }
  },
} satisfies LatexOperationHost;
