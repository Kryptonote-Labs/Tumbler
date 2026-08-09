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
    expect(source).not.toContain("contenteditable");
  });

  test("mounts only an overscanned page window", () => {
    const layout = {
      fragmentCount: 0,
      pages: Array.from({ length: 100 }, (_, index) => ({ index, width: 612, height: 792, section: {} as never, columns: [], headerLines: [], footerLines: [], headerTables: [], footerTables: [] })),
    } satisfies WordLayout;
    const viewport = calculateWordPageViewport(layout, 20_000, 800, 24, 1);
    expect(viewport.first).toBeGreaterThan(10);
    expect(viewport.last - viewport.first).toBeLessThanOrEqual(4);
    expect(viewport.totalHeight).toBeGreaterThan(100_000);
  });

  test("converts browser pixel metrics back into document points", () => {
    const context = {
      font: "",
      direction: "ltr" as CanvasDirection,
      measureText: () => ({ width: 40, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 4 }) as TextMetrics,
    };
    const format = {
      fontFamily: "Aptos", fontSizePoints: 12, bold: true, italic: false, underline: "single" as const,
      strike: false, color: "#123456", highlight: undefined, verticalAlign: "baseline" as const, rightToLeft: false,
    };
    expect(browserWordTextMeasurer(context).measure("Hello", format)).toEqual({ width: 30, ascent: 9, descent: 3 });
    expect(context.font).toContain("700 16px");
    expect(wordTextCss(format)).toContain("text-decoration-line:underline");
  });
});
