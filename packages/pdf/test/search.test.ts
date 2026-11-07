import { expect, test } from "bun:test";
import { pdfFixture, pdfStream } from "./pdf-fixture.ts";
import {
  openPdfDocument,
  PdfSearchIndex,
  PdfTextModel,
  PdfEditingFonts,
  importPdfText,
  PdfInterpreter,
} from "../src/index.ts";
function document(content: string) {
  return openPdfDocument(
    pdfFixture([
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F 5 0 R >> >> /Contents 4 0 R >>",
      pdfStream(content),
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]),
  );
}
test("literal matching spans visual lines and returns separate top-left rectangles", () => {
  const index = new PdfSearchIndex(
    document(
      "BT /F 12 Tf 20 150 Td (Invoice) Tj 0 -18 Td (number: INV-2026-042) Tj ET",
    ),
  );
  const result = index.find("invoice number");
  expect(result.total).toBe(1);
  expect(result.matches[0]).toMatchObject({
    page: 1,
    text: "Invoice number",
    context: "Invoice number: INV-2026-042",
  });
  expect(result.matches[0]!.rects).toHaveLength(2);
  expect(result.matches[0]!.rects[0]!.x).toBeCloseTo(20);
  expect(result.matches[0]!.rects[0]!.y).toBeGreaterThan(30);
  expect(index.find("invoice", { matchCase: true }).total).toBe(0);
  expect(index.find("Invoice", { matchCase: true }).total).toBe(1);
  expect(index.find("INV-2026.*").total).toBe(0);
  expect(index.find("   ").total).toBe(0);
  expect(() => index.find("Invoice", { pages: [2] })).toThrow();
});
test("ligature and case expansion retain source glyph geometry", () => {
  const pdf = document("BT /F 12 Tf 20 150 Td (x) Tj ET");
  const interpreter = new PdfInterpreter(pdf),
    scene = interpreter.page(0);
  const glyph = scene.elements.find((e) => e.kind === "glyph")!;
  const fake = {
    page: () => ({
      ...scene,
      elements: [{ ...glyph, glyph: { ...glyph.glyph, unicode: "ﬃİ" } }],
    }),
  } as unknown as PdfInterpreter;
  const index = new PdfSearchIndex(pdf, undefined, fake);
  expect(index.find("ffi").matches[0]!.text).toBe("ﬃ");
  expect(index.find("İ").matches[0]!.text).toBe("İ");
  expect(index.find("ffi").matches[0]!.rects).toEqual(
    index.find("İ").matches[0]!.rects,
  );
});
test("invisible OCR is searchable; pages without text have no matches", async () => {
  const pdf = openPdfDocument(
    await Bun.file(
      new URL("./fixtures/hidden-ocr.pdf", import.meta.url),
    ).bytes(),
  );
  expect(new PdfSearchIndex(pdf).find("SCAN").total).toBeGreaterThan(0);
  expect(new PdfSearchIndex(document("")).find("anything").total).toBe(0);
});
test("edited and deleted text replace originals without adding undo entries", async () => {
  const pdf = document("BT /F 12 Tf 20 150 Td (Invoice number) Tj ET");
  const model = new PdfTextModel(),
    fonts = new PdfEditingFonts();
  fonts.add(
    "Sans-Regular",
    await Bun.file(
      new URL(
        "./fixtures/editing-fonts/LiberationSans-Regular.ttf",
        import.meta.url,
      ),
    ).bytes(),
  );
  fonts.importDocument(pdf);
  model.initialize(importPdfText(pdf));
  const id = model.ids()[0]!;
  model.replace(id, 0, model.text(id).length, "Receipt number");
  const size = model.undo.undoStack.length;
  const index = new PdfSearchIndex(pdf, { model, fonts });
  expect(index.find("invoice").total).toBe(0);
  expect(index.find("receipt number").total).toBe(1);
  expect(model.undo.undoStack.length).toBe(size);
  model.hide(id);
  expect(new PdfSearchIndex(pdf, { model, fonts }).find("receipt").total).toBe(
    0,
  );
  model.doc.destroy();
});
test("searches every page with one-based page filtering", async () => {
  const pdf = openPdfDocument(
    await Bun.file(
      new URL("./fixtures/page-sequence.pdf", import.meta.url),
    ).bytes(),
  );
  const index = new PdfSearchIndex(pdf);
  const all = index.find("page");
  expect(new Set(all.matches.map((m) => m.page)).size).toBeGreaterThan(1);
  const filtered = index.find("page", { pages: [2] });
  expect(filtered.total).toBeGreaterThan(0);
  expect(filtered.matches.every((m) => m.page === 2)).toBe(true);
});
