import type { PreparedParagraph, PreparedTable, PreparedTableCell } from './layout.ts';

type Block = PreparedParagraph | PreparedTable;
type Split<T> = { readonly head: T; readonly tail?: T };
const EPSILON = 1e-7;
const splits = new WeakMap<PreparedTable, { available: number; force: boolean; result: Split<PreparedTable> | undefined }>();
interface JoinedTables { readonly next: WeakMap<PreparedTable, JoinedTables>; value?: PreparedTable }
const joins = new WeakMap<PreparedTable, JoinedTables>();

export function preparedBlockHeight(block: Block): number {
  return 'paragraph' in block
    ? (block.format.spacingBeforeTwips + block.format.spacingAfterTwips) / 20 +
      block.lines.reduce((sum, line) => sum + line.ascent + line.descent, 0)
    : block.rowHeights.reduce((sum, height) => sum + height, 0);
}

/** Split at line boundaries independently in each cell, retaining source offsets and IDs.
 * force permits an indivisible line/drawing taller than the page to make progress, just
 * as the paragraph paginator does. Ordinary lines never cross the page boundary.
 */
export function splitPreparedTable(table: PreparedTable, available: number, force = false): Split<PreparedTable> | undefined {
  const cached = splits.get(table);
  if (cached && cached.available === available && cached.force === force) return cached.result;
  const result = splitTable(table, available, force);
  splits.set(table, { available, force, result });
  return result;
}

function splitTable(table: PreparedTable, available: number, force: boolean): Split<PreparedTable> | undefined {
  if (available <= EPSILON && !force) return undefined;
  const height = preparedBlockHeight(table);
  if (height <= available + EPSILON) return { head: table };
  let cut = Math.max(0, available);
  const offsets = [0];
  for (const row of table.rowHeights) offsets.push(offsets.at(-1)! + row);
  const headCells: PreparedTableCell[] = [];
  const tailCells: PreparedTableCell[] = [];
  // Splits retain the original row grid. Empty rows on either side are removed below.
  let madeProgress = false;
  for (const cell of table.cells) {
    const start = offsets[cell.resolved.row]!;
    const end = offsets[cell.resolved.row + cell.resolved.rowSpan]!;
    if (start >= cut - EPSILON && !(force && start === 0)) {
      tailCells.push(cell);
      continue;
    }
    if (end <= cut + EPSILON) {
      headCells.push(cell);
      madeProgress = true;
      continue;
    }
    const capacity = Math.max(0, cut - start - cell.margins.top);
    let split = splitBlocks(cell.blocks, capacity, force && start === 0);
    // Keep the final line with its bottom cell padding, rather than producing a
    // continuation page containing only padding.
    if (!split.tail.length && cell.margins.bottom > 0)
      split = splitBlocks(cell.blocks, Math.max(0, capacity - cell.margins.bottom), force && start === 0);
    if (split.head.length) madeProgress = true;
    const head = withBlocks(cell, split.head, { ...cell.margins, bottom: 0 });
    const tail = withBlocks(cell, split.tail, { ...cell.margins, top: 0 });
    headCells.push({ ...head, verticalAlignment: 'top' });
    tailCells.push({ ...tail, verticalAlignment: 'top' });
    // Only the forced, indivisible first item can exceed the available height.
    cut = Math.max(cut, start + head.contentHeight);
  }
  if (!madeProgress && !force) return undefined;
  if (cut <= EPSILON) return undefined;
  const headRows = table.rowHeights.map((row, index) => Math.max(0, Math.min(row, cut - offsets[index]!)));
  const tailRows = table.rowHeights.map((row, index) => Math.max(0, Math.min(row, offsets[index + 1]! - cut)));
  // A deferred line can be taller than the unused portion of its source row. Grow
  // that row before placing later rows, so continuation text never overlaps them.
  for (const cell of tailCells) {
    const { row, rowSpan } = cell.resolved;
    const end = row + rowSpan;
    const allocated = tailRows.slice(row, end).reduce((sum, value) => sum + value, 0);
    if (allocated < cell.contentHeight) tailRows[end - 1]! += cell.contentHeight - allocated;
  }
  const head = compactRows(table, headRows, headCells);
  const tail = compactRows(table, tailRows, tailCells);
  return { head, ...(tail.rowHeights.length ? { tail } : {}) };
}

function withBlocks(cell: PreparedTableCell, blocks: readonly Block[], margins: PreparedTableCell['margins']): PreparedTableCell {
  return { ...cell, blocks: Object.freeze(blocks), margins,
    contentHeight: blocks.reduce((sum, block) => sum + preparedBlockHeight(block), 0) + margins.top + margins.bottom };
}

function splitBlocks(blocks: readonly Block[], available: number, force: boolean): { head: Block[]; tail: Block[] } {
  const head: Block[] = [];
  let used = 0;
  for (const [index, block] of blocks.entries()) {
    const height = preparedBlockHeight(block);
    if (used + height <= available + EPSILON) {
      head.push(block);
      used += height;
      continue;
    }
    const split = 'paragraph' in block
      ? splitParagraph(block, available - used, force && head.length === 0)
      : splitPreparedTable(block, available - used, force && head.length === 0);
    if (!split) return { head, tail: blocks.slice(index) };
    head.push(split.head);
    return { head, tail: [...(split.tail ? [split.tail] : []), ...blocks.slice(index + 1)] };
  }
  return { head, tail: [] };
}

function splitParagraph(paragraph: PreparedParagraph, available: number, force: boolean): Split<PreparedParagraph> | undefined {
  let used = paragraph.format.spacingBeforeTwips / 20;
  let count = 0;
  for (const line of paragraph.lines) {
    const height = line.ascent + line.descent;
    if (used + height > available + EPSILON && !(force && count === 0)) break;
    used += height;
    count += 1;
  }
  if (!count) return undefined;
  const head = Object.freeze({ ...paragraph, lines: Object.freeze(paragraph.lines.slice(0, count)),
    format: Object.freeze({ ...paragraph.format, spacingAfterTwips: 0 }) });
  if (count === paragraph.lines.length) return { head };
  return { head, tail: Object.freeze({ ...paragraph, marker: undefined,
    lines: Object.freeze(paragraph.lines.slice(count)),
    format: Object.freeze({ ...paragraph.format, spacingBeforeTwips: 0 }) }) };
}

function compactRows(table: PreparedTable, heights: readonly number[], cells: readonly PreparedTableCell[]): PreparedTable {
  const rows = heights.flatMap((height, index) => height > EPSILON ? [index] : []);
  const rowMap = new Map(rows.map((row, index) => [row, index]));
  const nextCells = cells.flatMap(cell => {
    const covered = rows.filter(row => row >= cell.resolved.row && row < cell.resolved.row + cell.resolved.rowSpan);
    if (!covered.length) return [];
    return [Object.freeze({ ...cell, resolved: Object.freeze({ ...cell.resolved,
      row: rowMap.get(covered[0]!)!, rowSpan: covered.length }) })];
  });
  return withRows(table, rows.map(row => heights[row]!), nextCells);
}

function withRows(table: PreparedTable, rowHeights: readonly number[], cells: readonly PreparedTableCell[]): PreparedTable {
  const cellsByRow = rowHeights.map((): PreparedTableCell[] => []);
  for (const cell of cells) cellsByRow[cell.resolved.row]!.push(cell);
  return Object.freeze({ ...table, rowHeights: Object.freeze(rowHeights), cells: Object.freeze(cells),
    cellsByRow: Object.freeze(cellsByRow.map(row => Object.freeze(row))) });
}

/** A page has one placement per table, including its repeated headers and split rows. */
export function joinPreparedTables(parts: readonly PreparedTable[]): PreparedTable {
  if (parts.length === 1) return parts[0]!;
  let branch = joins;
  let entry: JoinedTables | undefined;
  for (const part of parts) {
    entry = branch.get(part);
    if (!entry) branch.set(part, entry = { next: new WeakMap() });
    branch = entry.next;
  }
  if (entry?.value) return entry.value;
  const rowHeights: number[] = [];
  const cells: PreparedTableCell[] = [];
  for (const part of parts) {
    const offset = rowHeights.length;
    cells.push(...part.cells.map(cell => Object.freeze({ ...cell,
      resolved: Object.freeze({ ...cell.resolved, row: cell.resolved.row + offset }) })));
    rowHeights.push(...part.rowHeights);
  }
  const value = withRows(parts[0]!, rowHeights, cells);
  entry!.value = value;
  return value;
}
