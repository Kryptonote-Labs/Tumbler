import type { WordDocument, WordLayout } from '@tumblerjs/word';

export interface WordLayoutProgress {
  readonly document: WordDocument;
  /** Pages in this snapshot, not an estimate of the final total. May reset during convergence. */
  readonly pages: number;
  /** True only for the generator's final result, including notes and total-page fields. */
  readonly complete: boolean;
}

export interface WordLayoutError {
  readonly document: WordDocument;
  readonly error: unknown;
}

type Schedule = (run: () => void) => () => void;

/** A task boundary lets the browser process input and paint between pagination steps. */
const scheduleTask: Schedule = run => {
  const timer = setTimeout(run, 0);
  return () => clearTimeout(timer);
};

/** Advance once per task, including the first step. Cancellation closes the iterator. */
export function startWordLayoutJob(
  iterator: Iterator<WordLayout, WordLayout, void>,
  onlayout: (layout: WordLayout, complete: boolean) => void,
  onerror: (error: unknown) => void,
  schedule: Schedule = scheduleTask,
): () => void {
  let stopped = false;
  let cancelTask: (() => void) | undefined;
  const cancel = () => {
    if (stopped) return;
    stopped = true;
    cancelTask?.();
    iterator.return?.();
  };
  const advance = () => {
    if (stopped) return;
    let step: IteratorResult<WordLayout, WordLayout>;
    try {
      step = iterator.next();
    } catch (error) {
      cancel();
      onerror(error);
      return;
    }
    if (step.done) stopped = true;
    onlayout(step.value, step.done === true);
    // The callback can synchronously replace or destroy the view.
    if (!stopped) cancelTask = schedule(advance);
  };
  cancelTask = schedule(advance);
  return cancel;
}
