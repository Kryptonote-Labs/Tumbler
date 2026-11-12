import { expect, test } from 'bun:test';
import { createWordArtifact, layoutWordDocument, layoutWordDocumentProgressively, type WordLayout, type WordTextMeasurer } from '@tumblerjs/word';
import { startWordLayoutJob } from '../src/word-layout-job.ts';

const measurer: WordTextMeasurer = {
  measure: (text, format) => ({ width: text.length * format.fontSizePoints / 2, ascent: 9, descent: 3 }),
};
const document = createWordArtifact({ paragraphs: Array.from({ length: 200 }, (_, i) => ({ runs: [{ text: `Paragraph ${i} `.repeat(50) }] })) }).document;

function tasks() {
  const pending = new Set<() => void>();
  return {
    schedule: (run: () => void) => { pending.add(run); return () => { pending.delete(run); }; },
    get size() { return pending.size; },
    run() { const next = pending.values().next().value; if (next) { pending.delete(next); next(); } },
  };
}

test('defers preparation, advances one snapshot per task and publishes the final layout once', () => {
  const queue = tasks();
  const updates: { layout: WordLayout; complete: boolean }[] = [];
  const errors: unknown[] = [];
  startWordLayoutJob(layoutWordDocumentProgressively(document, measurer), (layout, complete) => updates.push({ layout, complete }), error => errors.push(error), queue.schedule);
  expect(updates).toHaveLength(0);
  queue.run();
  expect(updates).toHaveLength(1);
  expect(updates[0]?.complete).toBe(false);
  const first = JSON.stringify(updates[0]);
  while (queue.size) queue.run();
  expect(updates.filter(update => update.complete)).toHaveLength(1);
  expect(updates.at(-1)?.layout).toEqual(layoutWordDocument(document, measurer));
  expect(JSON.stringify(updates[0])).toBe(first);
  expect(errors).toEqual([]);
});

test('cancellation before the first task does no preparation', () => {
  const queue = tasks();
  let advances = 0;
  function* paginate(): Generator<WordLayout, WordLayout, void> { advances++; return { pages: [], fragmentCount: 0 }; }
  const cancel = startWordLayoutJob(paginate(), () => { throw new Error('stale'); }, () => {}, queue.schedule);
  cancel();
  queue.run();
  expect(advances).toBe(0);
  expect(queue.size).toBe(0);
});

test('replacement closes the stale iterator, including cancellation inside a progress callback', () => {
  const queue = tasks();
  let closed = false;
  let staleUpdates = 0;
  const empty: WordLayout = { pages: [], fragmentCount: 0 };
  function* paginate(): Generator<WordLayout, WordLayout, void> {
    try { yield empty; yield empty; return empty; } finally { closed = true; }
  }
  const cancel = startWordLayoutJob(paginate(), () => { staleUpdates++; cancel(); }, () => {}, queue.schedule);
  queue.run();
  expect(closed).toBe(true);
  expect(queue.size).toBe(0);
  let completed = false;
  startWordLayoutJob(layoutWordDocumentProgressively(createWordArtifact({ paragraphs: [{ runs: [{ text: 'Replacement' }] }] }).document, measurer), (_, complete) => { completed = complete; }, () => {}, queue.schedule);
  while (queue.size) queue.run();
  expect(staleUpdates).toBe(1);
  expect(completed).toBe(true);
});

test('reports a pagination failure once and stops scheduling', () => {
  const queue = tasks();
  const failure = new Error('measurement failed');
  const errors: unknown[] = [];
  startWordLayoutJob(layoutWordDocumentProgressively(document, { measure: () => { throw failure; } }), () => { throw new Error('unexpected layout'); }, error => errors.push(error), queue.schedule);
  queue.run();
  expect(errors).toEqual([failure]);
  expect(queue.size).toBe(0);
});

test('the default scheduler lets another host task run between snapshots', async () => {
  const events: string[] = [];
  await new Promise<void>((resolve, reject) => {
    startWordLayoutJob(layoutWordDocumentProgressively(document, measurer), (_, complete) => {
      events.push(complete ? 'complete' : 'progress');
      if (events.length === 1) setTimeout(() => events.push('host'), 0);
      if (complete) resolve();
    }, reject);
  });
  expect(events[0]).toBe('progress');
  expect(events[1]).toBe('host');
  expect(events.at(-1)).toBe('complete');
});
