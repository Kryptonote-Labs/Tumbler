import { expect, test } from "bun:test";
import { findVisibleSlideIndex } from "../src/index.ts";

const slides = [true, false, true, true, false, true].map((hidden) => ({ hidden }));

test("show entry skips leading hidden slides and retains a visible current slide", () => {
  expect(findVisibleSlideIndex(slides, 0)).toBe(1);
  expect(findVisibleSlideIndex(slides, 1)).toBe(1);
  expect(findVisibleSlideIndex(slides, 2)).toBe(4);
  expect(findVisibleSlideIndex(slides, 5)).toBeUndefined();
  expect(findVisibleSlideIndex(slides, 5, -1)).toBe(4);
});

test("next and previous skip hidden runs without wrapping", () => {
  expect(findVisibleSlideIndex(slides, 2)).toBe(4);
  expect(findVisibleSlideIndex(slides, 3, -1)).toBe(1);
  expect(findVisibleSlideIndex(slides, 5)).toBeUndefined();
  expect(findVisibleSlideIndex(slides, 0, -1)).toBeUndefined();
});

test("empty and entirely hidden decks have no show slide", () => {
  expect(findVisibleSlideIndex([], 0)).toBeUndefined();
  expect(findVisibleSlideIndex([{ hidden: true }], 0)).toBeUndefined();
  expect(findVisibleSlideIndex([{ hidden: true }], 0, -1)).toBeUndefined();
});

test("a single visible slide participates without wrapping", () => {
  expect(findVisibleSlideIndex([{ hidden: false }], 0)).toBe(0);
  expect(findVisibleSlideIndex([{ hidden: false }], 1)).toBeUndefined();
  expect(findVisibleSlideIndex([{ hidden: false }], -1, -1)).toBeUndefined();
});
