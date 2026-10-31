import type { PresentationSlide } from "./model.ts";

/** Find a non-hidden slide at or beyond start, without wrapping at either end. */
export function findVisibleSlideIndex(
  slides: readonly Pick<PresentationSlide, "hidden">[],
  start: number,
  direction: 1 | -1 = 1,
): number | undefined {
  for (let index = start; index >= 0 && index < slides.length; index += direction) {
    if (!slides[index]!.hidden) return index;
  }
  return undefined;
}
