interface LineMetrics { readonly ascent: number; readonly descent: number }

/** Completed paragraphs already have random-access lines; do not replay their iterator. */
export class CachedLineSequence<T extends LineMetrics> implements Iterable<T> {
  constructor(private readonly lines: readonly T[]) {}
  get(index: number) { return this.lines[index]; }
  heightUntil(maxHeight: number) {
    let height = 0;
    for (const line of this.lines) {
      height += line.ascent + line.descent;
      if (height > maxHeight) break;
    }
    return height;
  }
  [Symbol.iterator]() { return this.lines[Symbol.iterator](); }
}

/** Bounded lookahead shared by body pagination and keep/widow policies. */
export class PreparedLineSequence<T extends LineMetrics> implements Iterable<T> {
  private readonly values: T[] = [];
  private done = false;
  constructor(private readonly iterator: Iterator<T>, private readonly completed?: (lines: readonly T[]) => void) {}
  get(index: number): T | undefined {
    while (!this.done && this.values.length <= index) {
      const next = this.iterator.next();
      if (next.done) {
        this.done = true;
        this.completed?.(Object.freeze(this.values));
      } else this.values.push(next.value);
    }
    return this.values[index];
  }
  heightUntil(maxHeight: number): number {
    let height = 0;
    for (const line of this) {
      height += line.ascent + line.descent;
      if (height > maxHeight) break;
    }
    return height;
  }
  *[Symbol.iterator](): Generator<T> {
    for (let index = 0; ; index++) {
      const line = this.get(index);
      if (!line) return;
      yield line;
    }
  }
}
