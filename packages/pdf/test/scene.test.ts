import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { openPdfDocument } from "../src/document.ts";
import { PdfInterpreter } from "../src/interpreter.ts";
import { transform } from "../src/matrix.ts";

const scene = (name: string, page = 0) =>
  new PdfInterpreter(
    openPdfDocument(
      new Uint8Array(readFileSync(new URL(`./fixtures/${name}.pdf`, import.meta.url))),
    ),
  ).page(page);

describe("PDF interpretation", () => {
  test("text retains source objects, Unicode, explicit advances and stable scene identity", () => {
    const document = openPdfDocument(
      new Uint8Array(readFileSync(new URL("./fixtures/basic-text.pdf", import.meta.url))),
    );
    const interpreter = new PdfInterpreter(document),
      page = interpreter.page(0);
    expect(page.text).toBe("Hello Alex");
    expect(interpreter.page(0)).toBe(page);
    const glyphs = page.elements.filter((element) => element.kind === "glyph");
    expect(glyphs).toHaveLength(10);
    expect(glyphs[0]!.state.transform.slice(4)).toEqual([24, 110]);
    expect(glyphs[1]!.state.transform[4]).toBeCloseTo(34.108, 3);
    expect(glyphs[0]!.source.object.object).toBeGreaterThan(0);
    expect(glyphs[0]!.source.end).toBeGreaterThan(glyphs[0]!.source.start);
  });
  test("graphics state continues across separate content streams", () => {
    const page = scene("split-content-state");
    const path = page.elements.find((element) => element.kind === "path");
    expect(path?.state.fill).toBe("rgb(0, 0, 255)");
    expect(path?.state.transform).toEqual([1, 0, 0, 1, 20, 20]);
  });
  test("shared Form XObjects create independent instances without modifying their source", () => {
    const page = scene("shared-form");
    const glyphs = page.elements.filter((element) => element.kind === "glyph");
    expect(new Set(glyphs.map((glyph) => glyph.source.instance)).size).toBe(2);
    expect(new Set(glyphs.map((glyph) => glyph.source.object.key)).size).toBe(1);
  });
  test("page crop, inherited resources and rotation determine the viewport", () => {
    const page = scene("inherited-page");
    expect([page.width, page.height]).toEqual([140, 240]);
    expect(transform(page.viewport, 20, 20)).toEqual([0, 0]);
    expect(transform(page.viewport, 260, 160)).toEqual([140, 240]);
  });
  test("invisible OCR remains inspectable alongside the image", () => {
    const page = scene("hidden-ocr");
    expect(page.text).toBe("SCAN");
    expect(page.elements.some((element) => element.kind === "image")).toBe(true);
    expect(
      page.elements
        .filter((element) => element.kind === "glyph")
        .every((element) => element.mode === 3),
    ).toBe(true);
  });
  test("binary inline images consume the exact sample length rather than an embedded EI token", () => {
    const image = scene("inline-image").elements.find((element) => element.kind === "image");
    expect(image?.image.width).toBeGreaterThan(0);
    expect(image?.image.rgba?.length).toBe(image!.image.width * image!.image.height * 4);
  });
  test("embedded OpenType glyph outlines are available without browser text layout", () => {
    const glyph = scene("chromium-typography").elements.find(
      (element) => element.kind === "glyph" && element.glyph.unicode === "T",
    );
    expect(glyph?.kind === "glyph" && glyph.glyph.path).toBeTruthy();
  });
  test("annotation appearances render as separate instances", () => {
    const page = scene("annotation");
    expect(page.annotations.length).toBeGreaterThan(0);
    expect(page.elements.some((element) => element.source.instance.startsWith("annotation:"))).toBe(
      true,
    );
  });
});
