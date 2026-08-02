import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  createGridSelection,
  moveGridSelection,
  normalizeGridRange,
  type GridDirection,
} from "../src/index.ts";

describe("headless grid selection", () => {
  test("normalizes a backwards drag without losing its anchor", () => {
    const selection = createGridSelection({ row: 8, column: 6 }, { row: 2, column: 3 });
    expect(selection.anchor).toEqual({ row: 8, column: 6 });
    expect(selection.focus).toEqual({ row: 2, column: 3 });
    expect(selection.range).toEqual({ start: { row: 2, column: 3 }, end: { row: 8, column: 6 } });
  });

  test("moves or extends a selection and clamps to the grid", () => {
    const initial = createGridSelection({ row: 1, column: 1 });
    expect(moveGridSelection(initial, "up", { rows: 5, columns: 5 }).focus).toEqual({ row: 1, column: 1 });
    const extended = moveGridSelection(initial, "right", { rows: 5, columns: 5 }, { extend: true });
    expect(extended).toEqual({
      anchor: { row: 1, column: 1 },
      focus: { row: 1, column: 2 },
      range: { start: { row: 1, column: 1 }, end: { row: 1, column: 2 } },
    });
    expect(moveGridSelection(extended, "down", { rows: 5, columns: 5 }).focus).toEqual({ row: 2, column: 2 });
  });

  test("keeps generated navigation within bounds", () => {
    const direction = fc.constantFrom<GridDirection>("up", "down", "left", "right");
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 200 }),
      fc.integer({ min: 1, max: 100 }),
      fc.array(direction, { minLength: 0, maxLength: 500 }),
      (rows, columns, directions) => {
        let selection = createGridSelection({ row: rows, column: columns });
        for (const next of directions) selection = moveGridSelection(selection, next, { rows, columns });
        expect(selection.focus.row >= 1 && selection.focus.row <= rows).toBeTrue();
        expect(selection.focus.column >= 1 && selection.focus.column <= columns).toBeTrue();
      },
    ), { numRuns: 2_000 });
  });

  test("validates points and bounds", () => {
    expect(() => createGridSelection({ row: 0, column: 1 })).toThrow(RangeError);
    expect(() => normalizeGridRange({ row: 1, column: 1 }, { row: 2.5, column: 2 })).toThrow(RangeError);
    expect(() => moveGridSelection(createGridSelection({ row: 1, column: 1 }), "down", { rows: 0, columns: 1 })).toThrow(RangeError);
  });
});
