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
  // OCR glyphs have no editable owner; adjacent showing operators still form one word.
  const split = document("BT /F 12 Tf 3 Tr 20 150 Td (In) Tj (voice) Tj ET");
  const model = new PdfTextModel();
  model.initialize(importPdfText(split));
  try {
    expect(
      new PdfSearchIndex(split, { model, fonts: new PdfEditingFonts() }).find(
        "invoice",
      ).total,
    ).toBe(1);
  } finally {
    model.doc.destroy();
  }
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

async function editing(pdf: ReturnType<typeof document>) {
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
  model.pages.initialize(pdf.pages);
  return { model, fonts };
}

test("inserted blank pages retain existing matches and index their added text", async () => {
  const pdf = document("BT /F 12 Tf 20 150 Td (Invoice) Tj ET");
  const { model, fonts } = await editing(pdf);
  try {
    const blankId = model.pages.insert(pdf.pages);
    const blank = model.pages.items(pdf.pages).find((p) => p.id === blankId)!;
    expect(
      new PdfSearchIndex(pdf, { model, fonts }).find("invoice").matches[0]!
        .page,
    ).toBe(1);
    expect(
      new PdfSearchIndex(pdf, { model, fonts }).find("invoice", { pages: [2] })
        .total,
    ).toBe(0);
    const seed = model.seed(model.ids()[0]!);
    model.add({
      ...seed,
      id: "blank-text",
      page: blank.source.index,
      sources: [],
      delta: [{ insert: "Blank page text", attributes: seed.style }],
    });
    const undo = model.undo.undoStack.length;
    const index = new PdfSearchIndex(pdf, { model, fonts });
    expect(index.find("invoice").total).toBe(1);
    expect(index.find("blank page text").matches[0]!.page).toBe(2);
    expect(model.undo.undoStack.length).toBe(undo);
    model.pages.remove(pdf.pages, [pdf.pages[0]!.id]);
    expect(
      new PdfSearchIndex(pdf, { model, fonts }).find("blank page text")
        .matches[0]!.page,
    ).toBe(1);
  } finally {
    model.doc.destroy();
  }
});

test("formatting, editing, and moving regions preserve visible phrase order", async () => {
  const pdf = document(
    "BT /F 12 Tf 20 150 Td (Invoice) Tj 0 -40 Td (number 42) Tj ET",
  );
  const { model, fonts } = await editing(pdf);
  try {
    expect(model.ids()).toHaveLength(2);
    const id = model.ids()[0]!;
    const original = new PdfSearchIndex(pdf, { model, fonts });
    expect(original.find("Invoice number").total).toBe(1);
    model.format(id, 0, 7, { color: "#ff0000" });
    const formatted = new PdfSearchIndex(pdf, { model, fonts });
    expect(formatted.find("Invoice number").total).toBe(1);
    expect(formatted.find("42 Invoice").total).toBe(0);
    expect(formatted.find("Invoice number").matches[0]!.rects).toHaveLength(2);
    model.replace(id, 0, 7, "Receipt");
    expect(
      new PdfSearchIndex(pdf, { model, fonts }).find("Receipt number").total,
    ).toBe(1);
    model.place(id, { y: 160 });
    const moved = new PdfSearchIndex(pdf, { model, fonts });
    expect(moved.find("Receipt number").total).toBe(0);
    expect(moved.find("42 Receipt").total).toBe(1);
  } finally {
    model.doc.destroy();
  }
});

test("Greek sigma queries use the same casing rules as real extracted glyphs", () => {
  const pdf = openPdfDocument(
    pdfFixture([
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F 5 0 R >> >> /Contents 4 0 R >>",
      pdfStream("BT /F 12 Tf 20 150 Td (OS) Tj ET"),
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /ToUnicode 6 0 R >>",
      pdfStream(
        "1 begincodespacerange <00> <FF> endcodespacerange 2 beginbfchar <4F> <039F> <53> <03A3> endbfchar",
      ),
    ]),
  );
  const index = new PdfSearchIndex(pdf);
  for (const query of ["ΟΣ", "ος", "οσ"]) {
    const result = index.find(query);
    expect(result.total).toBe(1);
    expect(result.matches[0]!.text).toBe("ΟΣ");
    expect(result.matches[0]!.rects[0]!.width).toBeGreaterThan(0);
  }
  expect(index.find("ΟΣ", { matchCase: true }).total).toBe(1);
  expect(index.find("ος", { matchCase: true }).total).toBe(0);
  expect(index.find("σ").matches[0]!.text).toBe("Σ");
});
