import type { WordLayout } from "@tumblerjs/word";
import { wordPointsToCssPixels } from "@tumblerjs/word";

export interface WordPageViewport {
  readonly first: number;
  readonly last: number;
  readonly offsets: readonly number[];
  readonly totalHeight: number;
}

/** Projects a page layout into a small overscanned mounted window. */
export function calculateWordPageViewport(
  layout: WordLayout,
  scrollTop: number,
  viewportHeight: number,
  gap = 24,
  overscan = 1,
): WordPageViewport {
  if (![scrollTop, viewportHeight, gap].every(Number.isFinite) || scrollTop < 0 || viewportHeight < 0 || gap < 0 || !Number.isInteger(overscan) || overscan < 0) {
    throw new RangeError("Word page viewport geometry must be finite and non-negative.");
  }
  const offsets: number[] = [];
  let cursor = gap;
  for (const page of layout.pages) {
    offsets.push(cursor);
    cursor += wordPointsToCssPixels(page.height) + gap;
  }
  let first = 0;
  while (first + 1 < layout.pages.length && offsets[first + 1]! < scrollTop) first += 1;
  let last = first;
  while (last + 1 < layout.pages.length && offsets[last]! < scrollTop + viewportHeight) last += 1;
  first = Math.max(0, first - overscan);
  last = Math.min(layout.pages.length - 1, last + overscan);
  return Object.freeze({ first, last, offsets: Object.freeze(offsets), totalHeight: cursor });
}
