import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWordArtifact, openWordArtifact } from '@tumblerjs/word';
import { wordOperations } from '@tumblerjs/word/operations';
import { runTumbler, tumblerOperationHelp, operations } from '../src/index.ts';
import { createFileHost } from '../src/file-host.ts';

test('every operation has local help without opening a document', async () => {
  for (const name of new Set([...Object.keys(wordOperations), ...Object.keys(operations)])) {
    let output = '';
    const code = await runTumbler(['missing.docx', name, '--help'], {
      host: createFileHost(),
      stdout: (text) => (output += text),
      stderr: (text) => {
        throw new Error(text);
      },
    });
    expect(code).toBe(0);
    expect(output).toContain('Input schema');
    expect(output).not.toContain('undefined');
  }
  expect(tumblerOperationHelp('edit-table')).toContain('"merge-right"');
  expect(tumblerOperationHelp('edit-object')).toContain('verticalRelativeTo page|line|paragraph');
});

test('the floating-layout help recipe changes an existing inline ink object', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tumbler-help-'));
  const path = join(dir, 'drawing.docx');
  try {
    writeFileSync(
      path,
      createWordArtifact({
        paragraphs: [
          {
            runs: [
              {
                text: '\uFFFC',
                ink: {
                  width: 120,
                  height: 120,
                  strokes: [{ color: '#202020', size: 3, points: [[40, 40, 1]] }],
                },
              },
            ],
          },
        ],
      }).bytes(),
    );
    const host = createFileHost();
    const run = async (args: string[]) => {
      let stdout = '';
      let stderr = '';
      const code = await runTumbler(args, {
        host,
        stdout: (s) => (stdout += s),
        stderr: (s) => (stderr += s),
      });
      expect(stderr).toBe('');
      expect(code).toBe(0);
      return JSON.parse(stdout);
    };
    const help = tumblerOperationHelp('edit-object');
    const recipe = help
      .split('\n')
      .find(
        (line) => line.startsWith('tumbler <document> edit-object') && line.includes('"front"'),
      )!;
    const target = recipe.match(/--target '([^']+)'/)![1]!;
    const input = recipe.match(/--input '([^']+)'/)![1]!;
    for (const layout of ['front', 'behind', 'inline']) {
      const page = await run([path, 'read']);
      const patch = JSON.parse(input);
      patch.drawing.layout = layout;
      await run([
        path,
        'edit-object',
        '--page',
        page.page,
        '--target',
        target,
        '--input',
        JSON.stringify(patch),
      ]);
      const drawing = [...openWordArtifact(readFileSync(path)).document.drawings.values()][0]!;
      expect(drawing.placement).toBe(layout === 'inline' ? 'inline' : 'anchor');
      if (layout !== 'inline') {
        expect(drawing.anchor?.behindDocument).toBe(layout === 'behind');
        expect(drawing.anchor?.verticalRelativeTo).toBe('page');
        expect(drawing.anchor?.horizontalOffsetPoints).toBe(72);
      }
      expect(drawing.ink!.traces).toHaveLength(1);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
