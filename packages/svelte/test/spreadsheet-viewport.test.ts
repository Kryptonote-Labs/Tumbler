import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { compile } from "svelte/compiler";
import { SparseAxisGeometry } from "@tumbler/core";
import { calculateSpreadsheetViewport, coerceSpreadsheetEditValue, composeSpreadsheetGridLayout, frozenGridTranslation, measureMaximumDigitWidth, placeSpreadsheetDrawing, spreadsheetDrawingRegion, spreadsheetFontShorthand } from "../src/index.ts";
import { frozenAxisExtent, spreadsheetCellLayer } from "../src/spreadsheet-grid-layout.ts";

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

  test("keeps the worksheet canvas light independently of host chrome", async () => {
    const source = await Bun.file(new URL("../src/SpreadsheetGrid.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "SpreadsheetGrid.svelte", generate: "client", modernAst: true });
    expect(result.css?.code).toContain("color: var(--tumbler-sheet-fg, #111111)");
    expect(result.css?.code).toContain("background: var(--tumbler-sheet-bg, #ffffff)");
    expect(result.css?.code).toContain("border-right: 1px solid var(--tumbler-sheet-line, #d9ded9)");
    expect(result.css?.code).toContain("padding: 2px 8px");
  });

  test("contains touchpad momentum inside the worksheet scroller", async () => {
    const source = await Bun.file(new URL("../src/SpreadsheetGrid.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "SpreadsheetGrid.svelte", generate: "client", modernAst: true });
    expect(result.css?.code).toContain("overflow: auto");
    expect(result.css?.code).toContain("overscroll-behavior: contain");
  });

  test("keeps row and column gutters outside the scrolling canvas", async () => {
    const source = await Bun.file(new URL("../src/SpreadsheetGrid.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "SpreadsheetGrid.svelte", generate: "client", modernAst: true });
    expect(result.css?.code).toMatch(/\.tumbler-grid[^}]*overflow: hidden/);
    expect(result.css?.code).toMatch(/\.grid-scroller[^}]*overflow: auto/);
    expect(result.css?.code).toMatch(/\.column-gutter[^}]*position: absolute[^}]*top: 0/);
    expect(result.css?.code).toMatch(/\.row-gutter[^}]*position: absolute[^}]*top: 28px/);
  });

  test("keeps frozen cells in fixed pane overlays outside the scrolling canvas", async () => {
    const source = await Bun.file(new URL("../src/SpreadsheetGrid.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "SpreadsheetGrid.svelte", generate: "client", modernAst: true });
    expect(result.css?.code).toMatch(/\.frozen-row-pane[^}]*position: absolute/);
    expect(result.css?.code).toMatch(/\.frozen-column-pane[^}]*position: absolute/);
    expect(source).not.toContain("cellTransform");
    expect(source).not.toContain("frozenGridTranslation({ row");
  });

  test("disables browser autofill for the transient cell editor", async () => {
    const source = await Bun.file(new URL("../src/SpreadsheetGrid.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "SpreadsheetGrid.svelte", generate: "client", modernAst: true });
    expect(result.warnings).toHaveLength(0);
    expect(source).toContain('autocomplete="off"');
  });

  test("exposes hyperlink activation without turning document targets into browser hrefs", async () => {
    const source = await Bun.file(new URL("../src/SpreadsheetGrid.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "SpreadsheetGrid.svelte", generate: "client", modernAst: true });
    expect(result.warnings).toHaveLength(0);
    expect(source).toContain("onhyperlink?.(hyperlink)");
    expect(source).toContain('class="cell-hyperlink"');
    expect(source).not.toContain("href={hyperlink");
  });

  test("owns pointer range selection without allowing browser text selection", async () => {
    const source = await Bun.file(new URL("../src/SpreadsheetGrid.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "SpreadsheetGrid.svelte", generate: "client", modernAst: true });
    expect(result.warnings).toHaveLength(0);
    expect(result.css?.code).toMatch(/\.tumbler-grid[^}]*user-select: none/);
    expect(result.css?.code).toMatch(/\.cell[^}]*input[^}]*user-select: text/);
    expect(source).toContain("cellPointerDown(event, sourceRow, column)");
    expect(source).toContain("cellPointerEnter(event, sourceRow, column)");
    expect(source).toContain('event.pointerType !== "mouse"');
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
    expect(spreadsheetCellLayer({
      row: layout.merges[0]!.range.start.row,
      column: layout.merges[0]!.range.start.column,
      frozenRows: 2,
      frozenColumns: 1,
    })).toBeLessThan(3);
    expect(frozenGridTranslation({ row: 1, column: 5, frozenRows: 2, frozenColumns: 1, scrollTop: 400, scrollLeft: 2_000 })).toEqual({ x: 0, y: 400 });
    expect(frozenGridTranslation({ row: 5, column: 1, frozenRows: 2, frozenColumns: 1, scrollTop: 400, scrollLeft: 2_000 })).toEqual({ x: 2_000, y: 0 });
  });

  test("keeps frozen cells above ordinary cells and below worksheet headers", () => {
    expect(spreadsheetCellLayer({ row: 5, column: 5, frozenRows: 2, frozenColumns: 1 })).toBe(1);
    expect(spreadsheetCellLayer({ row: 1, column: 5, frozenRows: 2, frozenColumns: 1 })).toBe(2);
    expect(spreadsheetCellLayer({ row: 5, column: 1, frozenRows: 2, frozenColumns: 1 })).toBe(2);
  });

  test("places drawing anchors in the pane containing their top-left marker", () => {
    const marker = { column: 0, row: 0, columnOffsetEmu: 0, rowOffsetEmu: 0 };
    const anchor = { kind: "one-cell" as const, elementId: 1, from: marker, widthEmu: 1, heightEmu: 1 };
    expect(spreadsheetDrawingRegion(anchor, 1, 1)).toBe("frozen-row");
    expect(spreadsheetDrawingRegion({ ...anchor, from: { ...marker, row: 4 } }, 1, 1)).toBe("frozen-column");
    expect(spreadsheetDrawingRegion({ ...anchor, from: { ...marker, row: 4, column: 4 } }, 1, 1)).toBe("body");
    expect(spreadsheetDrawingRegion({ kind: "absolute", elementId: 2, xEmu: 0, yEmu: 0, widthEmu: 1, heightEmu: 1 }, 5, 5)).toBe("body");
    const placement = placeSpreadsheetDrawing({
      anchor: { ...anchor, from: { ...marker, row: 4, column: 4 } },
      bounds: { x: 1_000, y: 2_000, width: 400, height: 300 },
      frozenRows: 1, frozenColumns: 1, frozenRowsHeight: 20, frozenColumnsWidth: 80,
      scrollTop: 1_900, scrollLeft: 900, viewportWidth: 800, viewportHeight: 600,
      rowHeaderWidth: 52, columnHeaderHeight: 28,
    });
    expect(placement).toEqual({ region: "body", left: 1_052, top: 2_028, visible: true });
    expect(placeSpreadsheetDrawing({
      anchor: { ...anchor, from: { ...marker, row: 100, column: 100 } },
      bounds: { x: 100_000, y: 100_000, width: 400, height: 300 },
      frozenRows: 1, frozenColumns: 1, frozenRowsHeight: 20, frozenColumnsWidth: 80,
      scrollTop: 0, scrollLeft: 0, viewportWidth: 800, viewportHeight: 600,
      rowHeaderWidth: 52, columnHeaderHeight: 28,
    }).visible).toBeFalse();
  });

  test("renders selected chart frames above cells but below worksheet gutters", async () => {
    const source = await Bun.file(new URL("../src/SpreadsheetGrid.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "SpreadsheetGrid.svelte", generate: "client", modernAst: true });
    expect(result.warnings).toHaveLength(0);
    expect(source).toContain("placeSpreadsheetDrawing({");
    expect(source).toContain("onchartselectionchange?.(chartSelection)");
    expect(result.css?.code).toMatch(/\.chart-frame[^}]*z-index: 2/);
    expect(result.css?.code).toMatch(/\.column-gutter[^}]*z-index: 3/);
  });

  test("clips scrolling gutters after the frozen axis extent", () => {
    const geometry = new SparseAxisGeometry(10, 20, [{ index: 1, size: 30 }, { index: 2, size: 0 }, { index: 3, size: 25 }]);
    expect(frozenAxisExtent(geometry, 0)).toBe(0);
    expect(frozenAxisExtent(geometry, 1)).toBe(30);
    expect(frozenAxisExtent(geometry, 2)).toBe(30);
    expect(frozenAxisExtent(geometry, 3)).toBe(55);
    expect(() => frozenAxisExtent(geometry, -1)).toThrow(RangeError);
  });

  test("coerces grid editor input into typed scalar edits", () => {
    expect(coerceSpreadsheetEditValue("42.5", undefined)).toBe(42.5);
    expect(coerceSpreadsheetEditValue("1e3", { type: "number", value: 1, lexical: "1" })).toBe(1_000);
    expect(coerceSpreadsheetEditValue("FALSE", { type: "boolean", value: true })).toBeFalse();
    expect(coerceSpreadsheetEditValue("001", { type: "string", value: "old", storage: "inline" })).toBe("001");
    expect(coerceSpreadsheetEditValue("12 apples", { type: "number", value: 12, lexical: "12" })).toBe("12 apples");
    expect(coerceSpreadsheetEditValue("", undefined)).toBe("");
  });

  test("derives standard column metrics from the Normal style font", () => {
    expect(measureMaximumDigitWidth((digit) => digit === "8" ? 8.6 : 7.2)).toBe(9);
    expect(measureMaximumDigitWidth(() => Number.NaN)).toBe(7);
    expect(spreadsheetFontShorthand({
      name: "cached",
      scheme: "minor",
      size: 12,
      bold: true,
      italic: true,
      underline: undefined,
      strike: false,
      color: undefined,
    }, `Aptos "Display"`)).toBe(`italic 700 12pt "Aptos \\"Display\\""`);
  });
});
