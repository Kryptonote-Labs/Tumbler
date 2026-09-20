import { describe, expect, test } from "bun:test";
import { compile } from "svelte/compiler";
import type { WordLayout } from "@tumblerjs/word";
import { browserWordTextMeasurer, calculateWordPageViewport, wordTextCss } from "../src/index.ts";

describe("owned Svelte Word document head", () => {
  test("compiles accessible virtualized page markup", async () => {
    const source = await Bun.file(new URL("../src/WordDocumentView.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "WordDocumentView.svelte", generate: "client", modernAst: true });
    expect(result.warnings).toEqual([]);
    expect(source).toContain('aria-label="Document pages"');
    expect(source).toContain("calculateWordPageViewport");
    expect(source).toContain("layout.pages.slice");
    expect(source).toContain("contenteditable={editable}");
    expect(source).toContain("onbeforeinput={handleBeforeInput}");
    expect(source).toContain("browserTextSelection() ?? selection");
    expect(source).toContain("class:empty-line");
  });

  test("compiles recursive body and auxiliary table rendering", async () => {
    const source = await Bun.file(new URL("../src/WordLayoutTableView.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "WordLayoutTableView.svelte", generate: "client", modernAst: true });
    expect(result.warnings).toEqual([]);
    expect(source).toContain("cell.tables as nested");
    expect(source).toContain("data-story={story}");
  });

  test("mounts only an overscanned page window", () => {
    const layout = {
      fragmentCount: 0,
      pages: Array.from({ length: 100 }, (_, index) => ({ index, width: 612, height: 792, section: {} as never, columns: [], headerLines: [], footerLines: [], headerTables: [], footerTables: [], noteLines: [], noteTables: [], noteSeparatorY: undefined })),
    } satisfies WordLayout;
    const viewport = calculateWordPageViewport(layout, 20_000, 800, 24, 1);
    expect(viewport.first).toBeGreaterThan(10);
    expect(viewport.last - viewport.first).toBeLessThanOrEqual(4);
    expect(viewport.totalHeight).toBeGreaterThan(100_000);
  });

  test("reserves horizontal space for the widest page even outside the mounted window", () => {
    const layout = {
      fragmentCount: 0,
      pages: Array.from({ length: 10 }, (_, index) => ({ index, width: index === 9 ? 792 : 612, height: 792, section: {} as never, columns: [], headerLines: [], footerLines: [], headerTables: [], footerTables: [], noteLines: [], noteTables: [], noteSeparatorY: undefined })),
    } satisfies WordLayout;
    const top = calculateWordPageViewport(layout, 0, 800);
    const bottom = calculateWordPageViewport(layout, 10_000, 800);
    expect(top.last).toBeLessThan(9);
    expect(top.totalWidth).toBe(1104);
    expect(bottom.totalWidth).toBe(top.totalWidth);
    expect(calculateWordPageViewport(layout, 0, 800, 12).totalWidth).toBe(1080);
  });

  test("converts browser pixel metrics back into document points", () => {
    const context = {
      font: "",
      direction: "ltr" as CanvasDirection,
      measureText: () => ({
        width: 40,
        fontBoundingBoxAscent: 12,
        fontBoundingBoxDescent: 4,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 2,
      }) as TextMetrics,
    };
    const format = {
      fontFamily: "Aptos", fontSizePoints: 12, bold: true, italic: false, underline: "single" as const,
      strike: false, color: "#123456", highlight: undefined, verticalAlign: "baseline" as const, rightToLeft: false,
    };
    expect(browserWordTextMeasurer(context).measure("Hello", format)).toEqual({ width: 30, ascent: 9, descent: 3 });
    expect(context.font).toContain("700 16px");
    expect(wordTextCss(format)).toContain("text-decoration-line:underline");
  });

  test("uses stable font boxes instead of glyph-dependent painted bounds", () => {
    let glyph = "T";
    const context = {
      font: "",
      direction: "ltr" as CanvasDirection,
      measureText: () => ({
        width: 8,
        fontBoundingBoxAscent: 13,
        fontBoundingBoxDescent: 4,
        actualBoundingBoxAscent: glyph === "T" ? 12 : 8,
        actualBoundingBoxDescent: glyph === "T" ? 0 : 3,
      }) as TextMetrics,
    };
    const format = {
      fontFamily: "Aptos", fontSizePoints: 12, bold: false, italic: false, underline: "none" as const,
      strike: false, color: "#000000", highlight: undefined, verticalAlign: "baseline" as const, rightToLeft: false,
    };
    const measurer = browserWordTextMeasurer(context);

    const uppercase = measurer.measure(glyph, format);
    glyph = "x";
    const lowercase = measurer.measure(glyph, format);

    expect(uppercase.ascent).toBe(lowercase.ascent);
    expect(uppercase.descent).toBe(lowercase.descent);
    expect(uppercase).toMatchObject({ ascent: 9.75, descent: 3 });
  });
});
