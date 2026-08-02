import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { compile } from "svelte/compiler";
import { calculateSpreadsheetViewport } from "../src/index.ts";

describe("Svelte spreadsheet viewport", () => {
  test("mounts only a small overscanned window for an Excel-sized grid", () => {
    const viewport = calculateSpreadsheetViewport({
      rowCount: 1_048_576,
      columnCount: 16_384,
      rowHeight: 28,
      columnWidth: 112,
      scrollTop: 14_000_000,
      scrollLeft: 800_000,
      viewportHeight: 700,
      viewportWidth: 1_200,
      overscan: 3,
    });
    expect(viewport.rows.length).toBeLessThanOrEqual(31);
    expect(viewport.columns.length).toBeLessThanOrEqual(17);
    expect(viewport.rows[0]!.index).toBeGreaterThan(1);
    expect(viewport.columns[0]!.index).toBeGreaterThan(1);
    expect(viewport.totalHeight).toBe(29_360_128);
    expect(viewport.totalWidth).toBe(1_835_008);
  });

  test("keeps generated windows ordered and inside their axes", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 20_000 }),
      fc.integer({ min: 1, max: 5_000 }),
      fc.double({ min: 1, max: 200, noNaN: true }),
      fc.double({ min: 0, max: 2_000_000, noNaN: true }),
      (count, viewportSize, itemSize, scroll) => {
        const result = calculateSpreadsheetViewport({
          rowCount: count,
          columnCount: count,
          rowHeight: itemSize,
          columnWidth: itemSize,
          scrollTop: scroll,
          scrollLeft: scroll,
          viewportHeight: viewportSize,
          viewportWidth: viewportSize,
        });
        for (const axis of [result.rows, result.columns]) {
          expect(axis.every((item, index) => item.index >= 1 && item.index <= count && (index === 0 || item.index > axis[index - 1]!.index))).toBeTrue();
        }
      },
    ), { numRuns: 3_000 });
  });

  test("compiles the owned SpreadsheetGrid Svelte component", async () => {
    const source = await Bun.file(new URL("../src/SpreadsheetGrid.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "SpreadsheetGrid.svelte", generate: "client", modernAst: true });
    expect(result.js.code).toContain("tumbler-grid");
    expect(result.warnings).toEqual([]);
  });

  test("rejects invalid viewport geometry", () => {
    const valid = {
      rowCount: 1,
      columnCount: 1,
      rowHeight: 28,
      columnWidth: 112,
      scrollTop: 0,
      scrollLeft: 0,
      viewportHeight: 100,
      viewportWidth: 100,
    };
    expect(() => calculateSpreadsheetViewport({ ...valid, rowCount: 0 })).toThrow(RangeError);
    expect(() => calculateSpreadsheetViewport({ ...valid, rowHeight: Number.NaN })).toThrow(RangeError);
    expect(() => calculateSpreadsheetViewport({ ...valid, scrollLeft: -1 })).toThrow(RangeError);
  });
});
