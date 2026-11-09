import { expect, test } from 'bun:test';
import { mkdtemp, rm, symlink, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runTumbler } from '../src/index.ts';
import { createFileHost } from '../src/file-host.ts';

test('spreadsheet CLI authors values and formulas, preserves aliases and rejects stale receipts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tumbler-sheets-cli-'));
  const path = join(directory, 'budget.xlsx');
  const alias = join(directory, 'alias.xlsx');
  const host = createFileHost();
  let stdout = '';
  let stderr = '';
  const execute = async (argv: string[]) => {
    stdout = '';
    stderr = '';
    return runTumbler(argv, {
      host,
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      },
    });
  };
  try {
    expect(await execute(['create', path])).toBe(0);
    expect(await execute([path, 'sheets', 'read'])).toBe(0);
    const initial = JSON.parse(stdout) as { page: string; sheet: { id: string } };
    await symlink(path, alias);
    expect(
      await execute([
        alias,
        'sheets',
        'batch',
        '--page',
        initial.page,
        '--input',
        JSON.stringify({
          commands: [
            {
              name: 'set-range',
              sheetId: initial.sheet.id,
              reference: 'A1',
              values: [
                [2, 'Revenue'],
                [3, 'Costs'],
              ],
            },
            {
              name: 'set-formula',
              sheetId: initial.sheet.id,
              reference: 'A3',
              formula: 'SUM(A1:A2)',
            },
          ],
        }),
      ]),
    ).toBe(0);
    expect((await lstat(alias)).isSymbolicLink()).toBe(true);
    expect(await execute([path, 'sheets', 'read', '--range', 'A1:B3'])).toBe(0);
    expect(JSON.parse(stdout).cells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reference: 'A1', value: 2 }),
        expect.objectContaining({ reference: 'B2', value: 'Costs' }),
        expect.objectContaining({ reference: 'A3', formula: 'SUM(A1:A2)' }),
      ]),
    );
    const before = await Bun.file(path).bytes();
    expect(
      await execute([
        path,
        'sheets',
        'clear-range',
        '--page',
        initial.page,
        '--input',
        JSON.stringify({ sheetId: initial.sheet.id, range: 'A1:B3' }),
      ]),
    ).toBe(1);
    expect(stderr).toContain('changed');
    expect(await Bun.file(path).bytes()).toEqual(before);
    expect(
      await execute([
        path,
        'sheets',
        'set-cell',
        '--input',
        JSON.stringify({ sheetId: initial.sheet.id, reference: 'A1', value: 9 }),
      ]),
    ).toBe(1);
    expect(stderr).toContain('--page');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('spreadsheet help is local and invalid inputs never reach the host', async () => {
  let stdout = '';
  const unexpected = async () => {
    throw new Error('Host must not be called');
  };
  const host = {
    read: unexpected,
    create: unexpected,
    operate: unexpected,
    readSpreadsheet: unexpected,
    operateSpreadsheet: unexpected,
  };
  const execute = (args: string[]) =>
    runTumbler(args, {
      host,
      stdout: (text) => {
        stdout += text;
      },
      stderr: () => {},
    });
  expect(await execute(['missing.xlsx', 'sheets', 'set-cell', '--help'])).toBe(0);
  expect(stdout).toContain('reference');
  expect(await execute(['missing.xlsx', 'sheets', 'read', '--page', 'invalid'])).toBe(1);
  expect(await execute(['missing.xlsx', 'sheets', 'read', '--sheet', '1', '--sheet', '2'])).toBe(1);
  expect(await execute(['missing.xlsx', 'sheets', 'set-cell', '--input', '[]'])).toBe(1);
  expect(
    await execute([
      'missing.xlsx',
      'sheets',
      'set-cell',
      '--input',
      '{"sheetId":"1","reference":"A1","value":{}}',
    ]),
  ).toBe(1);
});
