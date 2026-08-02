import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  EXCEL_MAX_COLUMNS,
  EXCEL_MAX_ROWS,
  formatCellReference,
  formatCellRange,
  parseCellReference,
  parseCellRange,
} from "../src/index.ts";

describe("SpreadsheetML cell references", () => {
  test.each([
    ["A1", 1, 1],
    ["Z9", 9, 26],
    ["AA10", 10, 27],
    ["XFD1048576", EXCEL_MAX_ROWS, EXCEL_MAX_COLUMNS],
    ["xfd42", 42, EXCEL_MAX_COLUMNS],
  ] as const)("parses %s", (reference, row, column) => {
    expect(parseCellReference(reference)).toEqual({ row, column });
  });

  test.each(["", "A0", "A01", "1A", "$A$1", "XFE1", "A1048577", "AAAA1", "A 1"])(
    "rejects invalid reference %s",
    (reference) => expect(() => parseCellReference(reference)).toThrow(RangeError),
  );

  test("round-trips every generated grid coordinate", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: EXCEL_MAX_ROWS }),
      fc.integer({ min: 1, max: EXCEL_MAX_COLUMNS }),
      (row, column) => {
        const reference = formatCellReference({ row, column });
        expect(parseCellReference(reference)).toEqual({ row, column });
        expect(reference).toMatch(/^[A-Z]+[1-9][0-9]*$/);
      },
    ), { numRuns: 5_000 });
  });

  test("rejects non-integral and out-of-grid coordinates", () => {
    for (const address of [
      { row: 0, column: 1 },
      { row: 1, column: 0 },
      { row: 1.5, column: 1 },
      { row: EXCEL_MAX_ROWS + 1, column: 1 },
      { row: 1, column: EXCEL_MAX_COLUMNS + 1 },
    ]) {
      expect(() => formatCellReference(address)).toThrow(RangeError);
    }
  });

  test("parses, normalizes, and validates bounded ranges", () => {
    expect(parseCellRange("B2:D9")).toEqual({
      start: { row: 2, column: 2 },
      end: { row: 9, column: 4 },
    });
    expect(formatCellRange(parseCellRange("c3"))).toBe("C3");
    expect(() => parseCellRange("D9:B2")).toThrow(RangeError);
    expect(() => parseCellRange("A1:B2:C3")).toThrow(RangeError);
  });
});
