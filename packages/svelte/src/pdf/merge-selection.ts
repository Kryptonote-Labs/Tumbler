import { parsePdfPageSelection } from '@tumblerjs/pdf';

/** Empty text means all pages; an explicit empty selection is kept separately. */
export function mergePageSelection(value: string, count: number, none = false) {
  try {
    const pages = none ? [] : value.trim() ? parsePdfPageSelection(value, count) : Array.from({ length: count }, (_, index) => index);
    return { pages, custom: pages.some((page, index) => index > 0 && page <= pages[index - 1]!), error: '' };
  } catch (cause) {
    return { pages: [], custom: false, error: cause instanceof Error ? cause.message : 'Invalid page selection.' };
  }
}

/** Compact an ascending selection into editable, one-based inclusive ranges. */
export function mergePageRanges(pages: readonly number[]) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let at = 0; at < sorted.length; at++) {
    const first = sorted[at]!;
    let last = first;
    while (sorted[at + 1] === last + 1) last = sorted[++at]!;
    ranges.push(first === last ? String(first + 1) : `${first + 1}-${last + 1}`);
  }
  return ranges.join(',');
}

/** Checkbox interaction preserves a simple page order; range text retains arbitrary orders. */
export function toggleMergePage(pages: readonly number[], page: number, anchor?: number) {
  const selected = new Set(pages);
  if (anchor !== undefined) {
    for (let index = Math.min(anchor, page); index <= Math.max(anchor, page); index++) selected.add(index);
  } else if (selected.has(page)) selected.delete(page);
  else selected.add(page);
  return [...selected].sort((a, b) => a - b);
}
