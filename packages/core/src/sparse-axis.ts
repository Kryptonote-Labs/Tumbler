export interface AxisSizeOverride {
  readonly index: number;
  readonly size: number;
}

/** Maps sparse variable sizes onto a huge one-based axis without materializing it. */
export class SparseAxisGeometry {
  readonly count: number;
  readonly defaultSize: number;
  readonly overrides: readonly AxisSizeOverride[];
  readonly totalSize: number;
  readonly #cumulativeDeltas: readonly number[];

  constructor(count: number, defaultSize: number, overrides: Iterable<AxisSizeOverride> = []) {
    if (!Number.isSafeInteger(count) || count < 1) throw new RangeError("Axis count must be a positive integer.");
    finiteSize(defaultSize, "default axis size", false);
    const byIndex = new Map<number, number>();
    for (const override of overrides) {
      if (!Number.isSafeInteger(override.index) || override.index < 1 || override.index > count) {
        throw new RangeError("Axis override index is outside the axis.");
      }
      finiteSize(override.size, "axis override size", true);
      byIndex.set(override.index, override.size);
    }
    this.count = count;
    this.defaultSize = defaultSize;
    this.overrides = Object.freeze([...byIndex].sort(([left], [right]) => left - right).map(([index, size]) => Object.freeze({ index, size })));
    const deltas: number[] = [];
    let cumulative = 0;
    for (const override of this.overrides) {
      cumulative += override.size - defaultSize;
      deltas.push(cumulative);
    }
    this.#cumulativeDeltas = deltas;
    this.totalSize = count * defaultSize + cumulative;
  }

  size(index: number): number {
    this.#validateIndex(index);
    const position = lowerBound(this.overrides, index);
    return this.overrides[position]?.index === index ? this.overrides[position]!.size : this.defaultSize;
  }

  start(index: number): number {
    this.#validateIndex(index);
    const preceding = lowerBound(this.overrides, index);
    const delta = preceding === 0 ? 0 : this.#cumulativeDeltas[preceding - 1]!;
    return (index - 1) * this.defaultSize + delta;
  }

  indexAt(offset: number): number {
    if (!Number.isFinite(offset) || offset < 0) throw new RangeError("Axis offset must be a non-negative finite number.");
    if (offset >= this.totalSize) return this.count;
    let low = 1;
    let high = this.count;
    while (low < high) {
      const middle = Math.floor((low + high + 1) / 2);
      if (this.start(middle) <= offset) low = middle;
      else high = middle - 1;
    }
    while (low < this.count && this.size(low) === 0) low += 1;
    return low;
  }

  #validateIndex(index: number): void {
    if (!Number.isSafeInteger(index) || index < 1 || index > this.count) throw new RangeError("Axis index is outside the axis.");
  }
}

function lowerBound(overrides: readonly AxisSizeOverride[], index: number): number {
  let low = 0;
  let high = overrides.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (overrides[middle]!.index < index) low = middle + 1;
    else high = middle;
  }
  return low;
}

function finiteSize(value: number, context: string, allowZero: boolean): void {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new RangeError(`${context} must be ${allowZero ? "a non-negative" : "a positive"} finite number.`);
  }
}
