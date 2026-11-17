import { expect, test } from 'bun:test';
import { type PresentationCommand } from '@tumblerjs/slides';
import { runTumbler, type OperationHost } from '../src/index.ts';

function textHost() {
  const commands: PresentationCommand[] = [];
  const unavailable = async (): Promise<never> => {
    throw new Error('Unexpected Word operation');
  };
  const host = {
    read: unavailable,
    create: unavailable,
    operate: unavailable,
    operatePresentation: async (_document, { command }) => {
      commands.push(command);
      return {};
    },
  } satisfies OperationHost;
  const execute = async (name: string, input: unknown, ...flags: string[]) => {
    let error = '';
    const code = await runTumbler(
      ['deck', 'slides', name, '--input', JSON.stringify(input), ...flags],
      {
        host,
        stdout: () => {},
        stderr: (text) => {
          error += text;
        },
        readValue: async () => '雪 😀\nC:\\new\\test\n',
      },
    );
    return { code, error };
  };
  return { commands, execute };
}

test('slide text inputs share Word escape, literal and exact-file semantics', async () => {
  const { commands, execute } = textHost();
  const target = { slideId: 'slide', objectKey: 'shape', start: 0, end: 0 };
  expect(
    await execute(
      'insert-object',
      {
        slideId: 'slide',
        bounds: { x: 0, y: 0, width: 300, height: 100 },
        object: { kind: 'shape' },
      },
      '--value',
      String.raw`PROMPT\nState the intended outcome`,
    ),
  ).toEqual({ code: 0, error: '' });
  expect(commands.pop()).toMatchObject({ object: { text: 'PROMPT\nState the intended outcome' } });
  expect(
    await execute('edit-text', target, '--value', String.raw`C:\new\test`, '--literal'),
  ).toEqual({ code: 0, error: '' });
  expect(commands.pop()).toMatchObject({ value: String.raw`C:\new\test` });
  expect(await execute('edit-text', target, '--value', '')).toEqual({ code: 0, error: '' });
  expect(commands.pop()).toMatchObject({ value: '' });
  for (const path of ['-', 'text.txt']) {
    expect(await execute('set-notes', { slideId: 'slide' }, '--value-file', path)).toEqual({
      code: 0,
      error: '',
    });
    expect(commands.pop()).toMatchObject({ notes: '雪 😀\nC:\\new\\test\n' });
  }
  expect(await execute('edit-text', { ...target, value: String.raw`literal\ntext` })).toEqual({
    code: 0,
    error: '',
  });
  expect(commands.pop()).toMatchObject({ value: String.raw`literal\ntext` });
});

test('ambiguous and unsupported slide text flags never reach the document host', async () => {
  const { commands, execute } = textHost();
  const target = { slideId: 'slide', objectKey: 'shape', start: 0, end: 0 };
  for (const flags of [
    ['--literal'],
    ['--value', 'a', '--value-file', '-'],
    ['--value-file', '-', '--literal'],
    ['--value', 'a', '--value', 'b'],
    ['--value'],
  ]) {
    const result = await execute('edit-text', target, ...flags);
    expect(result.code).toBe(1);
    expect(result.error).not.toBe('');
  }
  expect(
    (await execute('edit-text', { ...target, value: 'inline' }, '--value', 'flag')).error,
  ).toContain('not both');
  expect(
    (await execute('set-notes', { slideId: 'slide', notes: 'inline' }, '--value', 'flag')).error,
  ).toContain('not both');
  const shape = { slideId: 'slide', bounds: { x: 0, y: 0, width: 100, height: 100 } };
  expect(
    (
      await execute(
        'insert-object',
        { ...shape, object: { kind: 'shape', text: '' } },
        '--value',
        'flag',
      )
    ).error,
  ).toContain('not both');
  expect(
    (
      await execute(
        'insert-object',
        { ...shape, object: { kind: 'image', data: '', contentType: 'image/png' } },
        '--value',
        'flag',
      )
    ).code,
  ).toBe(1);
  for (const name of ['batch', 'delete-slide', 'read', 'render']) {
    expect((await execute(name, {}, '--value', 'flag')).code).toBe(1);
  }
  expect(commands).toEqual([]);
});
