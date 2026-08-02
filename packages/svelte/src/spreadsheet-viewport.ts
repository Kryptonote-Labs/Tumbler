export interface SpreadsheetViewportInput {
  readonly rowCount: number;
  readonly columnCount: number;
  readonly rowHeight: number;
  readonly columnWidth: number;
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
  readonly overscan?: number;
}

export interface VirtualGridItem {
  /** One-based worksheet index. */
  readonly index: number;
  readonly start: number;
  readonly size: number;
}

export interface SpreadsheetViewport {
  readonly rows: readonly VirtualGridItem[];
  readonly columns: readonly VirtualGridItem[];
  readonly totalHeight: number;
  readonly totalWidth: number;
}

/** Calculates the small row/column window the Svelte head should mount. */
export function calculateSpreadsheetViewport(input: SpreadsheetViewportInput): SpreadsheetViewport {
  integer(input.rowCount, "rowCount", 1);
  integer(input.columnCount, "columnCount", 1);
  positive(input.rowHeight, "rowHeight");
  positive(input.columnWidth, "columnWidth");
  nonNegative(input.scrollTop, "scrollTop");
  nonNegative(input.scrollLeft, "scrollLeft");
  nonNegative(input.viewportHeight, "viewportHeight");
  nonNegative(input.viewportWidth, "viewportWidth");
  const overscan = input.overscan ?? 2;
  integer(overscan, "overscan", 0);
  return Object.freeze({
    rows: Object.freeze(axisItems(input.rowCount, input.rowHeight, input.scrollTop, input.viewportHeight, overscan)),
    columns: Object.freeze(axisItems(input.columnCount, input.columnWidth, input.scrollLeft, input.viewportWidth, overscan)),
    totalHeight: input.rowCount * input.rowHeight,
    totalWidth: input.columnCount * input.columnWidth,
  });
}

function axisItems(count: number, size: number, scroll: number, viewport: number, overscan: number): VirtualGridItem[] {
  const first = Math.max(0, Math.floor(scroll / size) - overscan);
  const visibleCount = Math.max(1, Math.ceil(viewport / size));
  const end = Math.min(count, first + visibleCount + overscan * 2);
  const result: VirtualGridItem[] = [];
  for (let zeroBased = first; zeroBased < end; zeroBased += 1) {
    result.push(Object.freeze({ index: zeroBased + 1, start: zeroBased * size, size }));
  }
  return result;
}

function integer(value: number, name: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError(`${name} must be an integer of at least ${minimum}.`);
}

function positive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number.`);
}

function nonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a non-negative finite number.`);
}
