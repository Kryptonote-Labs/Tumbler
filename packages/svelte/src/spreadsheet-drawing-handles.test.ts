import { describe, expect, test } from "bun:test";
import { resizeDrawingBounds } from "./spreadsheet-drawing-handles.ts";

const bounds = { x: 100, y: 50, width: 200, height: 100 };

describe("resizeDrawingBounds", () => {
  test("keeps the opposite corner fixed when dragging the top-left handle", () => {
    expect(resizeDrawingBounds(bounds, { x: -1, y: -1 }, 20, -10)).toEqual({ x: 120, y: 40, width: 180, height: 110 });
  });

  test("changes only one dimension from a side handle", () => {
    expect(resizeDrawingBounds(bounds, { x: 1, y: 0 }, 40, 999)).toEqual({ ...bounds, width: 240 });
    expect(resizeDrawingBounds(bounds, { x: 0, y: -1 }, 999, 30)).toEqual({ ...bounds, y: 80, height: 70 });
  });

  test("preserves the aspect ratio from a corner when asked", () => {
    expect(resizeDrawingBounds(bounds, { x: 1, y: 1 }, 200, 10, true)).toEqual({ ...bounds, width: 400, height: 200 });
  });

  test("stops at a minimum size without moving the fixed edge", () => {
    const result = resizeDrawingBounds(bounds, { x: -1, y: 0 }, 500, 0);
    expect(result.width).toBe(8);
    expect(result.x + result.width).toBe(bounds.x + bounds.width);
  });
});
