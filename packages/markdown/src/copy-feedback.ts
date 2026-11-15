export type NoteCopyStatus = 'idle' | 'copied' | 'failed';

/** Coalesce in-flight clicks and extend one success timer without restarting the visual state. */
export class NoteCopyFeedback {
  private pending: Promise<void> | undefined;
  private pendingGeneration = 0;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private status: NoteCopyStatus = 'idle';
  constructor(
    private text: () => string,
    private changed: (status: NoteCopyStatus) => void,
    private write: (text: string) => Promise<void> = (text) => navigator.clipboard.writeText(text),
  ) {}
  private show(status: NoteCopyStatus) {
    if (this.disposed || this.status === status) return;
    this.status = status;
    this.changed(status);
  }
  copy(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    clearTimeout(this.timer);
    if (this.pending) {
      // A block may have changed during a slow clipboard write. Queue the new snapshot after it.
      return this.pendingGeneration === this.generation
        ? this.pending
        : this.pending.then(() => this.copy());
    }
    const generation = this.generation;
    const text = this.text();
    this.pendingGeneration = generation;
    let written: Promise<void>;
    try {
      written = this.write(text);
    } catch (error) {
      written = Promise.reject(error);
    }
    const request = written
      .then(
        () => {
          if (this.disposed || generation !== this.generation) return;
          this.show('copied');
          this.timer = setTimeout(() => this.show('idle'), 1600);
        },
        () => {
          if (this.disposed || generation !== this.generation) return;
          this.show('failed');
        },
      )
      .finally(() => {
        if (this.pending === request) this.pending = undefined;
      });
    this.pending = request;
    return request;
  }
  reset() {
    this.generation++;
    clearTimeout(this.timer);
    this.show('idle');
  }
  destroy() {
    this.disposed = true;
    this.generation++;
    clearTimeout(this.timer);
  }
}
