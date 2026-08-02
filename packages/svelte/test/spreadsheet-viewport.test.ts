import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { compile } from "svelte/compiler";
import { SparseAxisGeometry } from "@tumbler/core";
import { calculateSpreadsheetViewport, composeSpreadsheetGridLayout, frozenGridTranslation } from "../src/index.ts";

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
    expect(viewport.columns.length).toBeLessThanOrEqual(18);
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

  test("uses sparse variable sizes and omits hidden axes", () => {
    const rows = new SparseAxisGeometry(100, 20, [{ index: 2, size: 40 }, { index: 3, size: 0 }]);
    const columns = new SparseAxisGeometry(50, 100, [{ index: 2, size: 250 }, { index: 4, size: 0 }]);
    const viewport = calculateSpreadsheetViewport({
      rowCount: 100, columnCount: 50, rowHeight: 20, columnWidth: 100,
      scrollTop: 15, scrollLeft: 90, viewportHeight: 100, viewportWidth: 400,
      overscan: 1, rowGeometry: rows, columnGeometry: columns,
    });
    expect(viewport.rows.find((row) => row.index === 2)).toEqual({ index: 2, start: 20, size: 40 });
    expect(viewport.rows.some((row) => row.index === 3)).toBeFalse();
    expect(viewport.columns.find((column) => column.index === 2)).toEqual({ index: 2, start: 100, size: 250 });
    expect(viewport.columns.some((column) => column.index === 4)).toBeFalse();
  });

  test("composes frozen axes and merged rectangles around a scrolling viewport", () => {
    const rows = new SparseAxisGeometry(100, 20, [{ index: 2, size: 30 }]);
    const columns = new SparseAxisGeometry(100, 100, [{ index: 3, size: 150 }]);
    const viewport = calculateSpreadsheetViewport({
      rowCount: 100, columnCount: 100, rowHeight: 20, columnWidth: 100,
      rowGeometry: rows, columnGeometry: columns,
      scrollTop: 400, scrollLeft: 2_000, viewportHeight: 200, viewportWidth: 500, overscan: 0,
    });
    const layout = composeSpreadsheetGridLayout({
      viewport, rowGeometry: rows, columnGeometry: columns, frozenRows: 2, frozenColumns: 1,
      merges: [{ start: { row: 1, column: 1 }, end: { row: 2, column: 3 } }],
    });
    expect(layout.rows.slice(0, 2).map((row) => row.index)).toEqual([1, 2]);
    expect(layout.columns[0]?.index).toBe(1);
    expect(layout.merges[0]).toMatchObject({ left: 0, top: 0, width: 350, height: 50 });
    expect(frozenGridTranslation({ row: 1, column: 5, frozenRows: 2, frozenColumns: 1, scrollTop: 400, scrollLeft: 2_000 })).toEqual({ x: 0, y: 400 });
    expect(frozenGridTranslation({ row: 5, column: 1, frozenRows: 2, frozenColumns: 1, scrollTop: 400, scrollLeft: 2_000 })).toEqual({ x: 2_000, y: 0 });
  });
});
