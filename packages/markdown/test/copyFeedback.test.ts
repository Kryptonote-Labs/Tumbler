import { expect, jest, test } from 'bun:test';
import { NoteCopyFeedback, type NoteCopyStatus } from '@tumblerjs/markdown/editor';

test('rapid copy clicks share one clipboard write and extend a steady success state', async () => {
  jest.useFakeTimers();
  const states: NoteCopyStatus[] = [];
  let clipboard = Promise.withResolvers<void>();
  const writes: string[] = [];
  const feedback = new NoteCopyFeedback(
    () => 'exact code\n',
    (state) => states.push(state),
    (text) => {
      writes.push(text);
      return clipboard.promise;
    },
  );
  try {
    const first = feedback.copy();
    expect(new Set(Array.from({ length: 100 }, () => feedback.copy()))).toEqual(new Set([first]));
    await Promise.resolve();
    expect(writes).toEqual(['exact code\n']);
    clipboard.resolve();
    await first;
    expect(states).toEqual(['copied']);
    jest.advanceTimersByTime(1599);
    clipboard = Promise.withResolvers<void>();
    const repeated = feedback.copy();
    expect(new Set(Array.from({ length: 100 }, () => feedback.copy()))).toEqual(
      new Set([repeated]),
    );
    await Promise.resolve();
    jest.advanceTimersByTime(3000);
    expect(states).toEqual(['copied']);
    clipboard.resolve();
    await repeated;
    jest.advanceTimersByTime(1599);
    expect(states).toEqual(['copied']);
    jest.advanceTimersByTime(1);
    expect(states).toEqual(['copied', 'idle']);
    expect(writes).toEqual(['exact code\n', 'exact code\n']);
  } finally {
    feedback.destroy();
    jest.useRealTimers();
  }
});

test('copying revised code waits for a slow previous write and discards stale feedback', async () => {
  jest.useFakeTimers();
  let text = 'old';
  const writes: string[] = [];
  const firstWrite = Promise.withResolvers<void>();
  const nextWrite = Promise.withResolvers<void>();
  const states: NoteCopyStatus[] = [];
  const feedback = new NoteCopyFeedback(
    () => text,
    (state) => states.push(state),
    (value) => {
      writes.push(value);
      return value === 'old' ? firstWrite.promise : nextWrite.promise;
    },
  );
  try {
    const first = feedback.copy();
    await Promise.resolve();
    text = 'new';
    feedback.reset();
    const next = feedback.copy();
    firstWrite.resolve();
    await first;
    await Promise.resolve();
    expect(states).toEqual([]);
    expect(writes).toEqual(['old', 'new']);
    nextWrite.resolve();
    await next;
    expect(states).toEqual(['copied']);
    feedback.reset();
    const last = feedback.copy();
    feedback.destroy();
    await last;
    jest.runAllTimers();
    expect(states).toEqual(['copied', 'idle']);
  } finally {
    feedback.destroy();
    jest.useRealTimers();
  }
});

test('a clipboard failure can be retried without leaving an old success timer', async () => {
  jest.useFakeTimers();
  let fail = true;
  const states: NoteCopyStatus[] = [];
  const feedback = new NoteCopyFeedback(
    () => 'code',
    (state) => states.push(state),
    async () => {
      if (fail) throw new Error('Denied');
    },
  );
  try {
    await feedback.copy();
    expect(states).toEqual(['failed']);
    fail = false;
    await feedback.copy();
    expect(states).toEqual(['failed', 'copied']);
    feedback.destroy();
    jest.runAllTimers();
    expect(states).toEqual(['failed', 'copied']);
  } finally {
    feedback.destroy();
    jest.useRealTimers();
  }
});
