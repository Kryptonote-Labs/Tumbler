import { SparseAxisGeometry } from "@tumblerjs/core";

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
  readonly rowGeometry?: SparseAxisGeometry;
  readonly columnGeometry?: SparseAxisGeometry;
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
export function calculateSpreadsheetViewport(input: SpreadsheetViewportInput, previous?: SpreadsheetViewport): SpreadsheetViewport {
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
  const rows = input.rowGeometry ?? new SparseAxisGeometry(input.rowCount, input.rowHeight);
  const columns = input.columnGeometry ?? new SparseAxisGeometry(input.columnCount, input.columnWidth);
  if (rows.count !== input.rowCount || columns.count !== input.columnCount) {
    throw new RangeError("Viewport geometry counts must match the grid counts.");
  }
  const visibleRows = reuseItems(axisItems(rows, input.scrollTop, input.viewportHeight, overscan), previous?.rows);
  const visibleColumns = reuseItems(axisItems(columns, input.scrollLeft, input.viewportWidth, overscan), previous?.columns);
  if (previous?.rows === visibleRows && previous.columns === visibleColumns && previous.totalHeight === rows.totalSize && previous.totalWidth === columns.totalSize) return previous;
  return Object.freeze({
    rows: visibleRows,
    columns: visibleColumns,
    totalHeight: rows.totalSize,
    totalWidth: columns.totalSize,
  });
}

/** Retain mounted item identities so scrolling does not invalidate every cell. */
function reuseItems(items: VirtualGridItem[], previous: readonly VirtualGridItem[] = []): readonly VirtualGridItem[] {
  const byIndex = new Map(previous.map(item => [item.index, item]));
  const next = items.map(item => {
    const existing = byIndex.get(item.index);
    return existing?.start === item.start && existing.size === item.size ? existing : item;
  });
  return next.length === previous.length && next.every((item, index) => item === previous[index]) ? previous : Object.freeze(next);
}

function axisItems(axis: SparseAxisGeometry, scroll: number, viewport: number, overscan: number): VirtualGridItem[] {
  const boundedStart = Math.min(scroll, Math.max(0, axis.totalSize - 1));
  const boundedEnd = Math.min(Math.max(boundedStart, scroll + viewport - 1), Math.max(0, axis.totalSize - 1));
  const first = Math.max(1, axis.indexAt(boundedStart) - overscan);
  const end = Math.min(axis.count, axis.indexAt(boundedEnd) + overscan);
  const result: VirtualGridItem[] = [];
  for (let index = first; index <= end; index += 1) {
    const size = axis.size(index);
    if (size > 0) result.push(Object.freeze({ index, start: axis.start(index), size }));
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
