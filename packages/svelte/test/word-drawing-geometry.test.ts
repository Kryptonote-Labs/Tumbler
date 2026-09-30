import { expect, test } from "bun:test";
import { resizeWordDrawingBox } from "../src/word-drawing-geometry.ts";

test("floating corner resizing preserves proportions and the opposite corner beyond the page", () => {
  const original = { x: 20, y: 30, width: 100, height: 50 };
  const resized = resizeWordDrawingBox(original, { x: -1, y: -1 }, -1000, -500, false);
  expect(resized).toEqual({ x: -980, y: -470, width: 1100, height: 550 });
  expect(resized.x + resized.width).toBe(original.x + original.width);
  expect(resized.y + resized.height).toBe(original.y + original.height);
  expect(resized.width / resized.height).toBe(original.width / original.height);
});

test("inline resizing changes dimensions without moving the text anchor or imposing a column limit", () => {
  const original = { x: 20, y: 30, width: 100, height: 50 };
  expect(resizeWordDrawingBox(original, { x: -1, y: -1 }, -1000, -500, true))
    .toEqual({ ...original, width: 1100, height: 550 });
});

test("edge resizing changes only its dimension and permits sizes below twelve points", () => {
  const original = { x: 20, y: 30, width: 100, height: 50 };
  expect(resizeWordDrawingBox(original, { x: 1, y: 0 }, -95, 1000, false))
    .toEqual({ ...original, width: 5 });
  expect(resizeWordDrawingBox(original, { x: 0, y: -1 }, 1000, 45, false))
    .toEqual({ ...original, y: 75, height: 5 });
});

test("dragging through the opposite edge keeps a positive serializable extent", () => {
  const original = { x: 20, y: 30, width: 100, height: 50 };
  const edge = resizeWordDrawingBox(original, { x: -1, y: 0 }, 200, 0, false);
  expect(edge.width).toBe(1 / 12700);
  expect(edge.x + edge.width).toBeCloseTo(original.x + original.width);
  const corner = resizeWordDrawingBox(original, { x: 1, y: 1 }, -200, -100, false);
  expect(Math.round(corner.height * 12700)).toBe(1);
  expect(corner.width / corner.height).toBe(2);
});
