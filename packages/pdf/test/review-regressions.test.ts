import { extractionFixture } from "./extraction-fixture.ts";
import { expect, test } from "bun:test";
import { openPdfDocument, PdfInterpreter, PdfStream, PdfError } from "../src/index.ts";
import { dictionary } from "../src/objects.ts";
import { createCanvas } from "@napi-rs/canvas";
import { pdfFixture, pdfStream, formExpansion } from "./pdf-fixture.ts";

test("ToUnicode changes extraction without changing the embedded TrueType glyph or fallback text", async () => {
  const document = openPdfDocument(await extractionFixture()),
    control = openPdfDocument(await extractionFixture("T"));
  const page = new PdfInterpreter(document).page(0),
    expected = new PdfInterpreter(control).page(0);
  const glyph = page.elements.find((e) => e.kind === "glyph"),
    original = expected.elements.find((e) => e.kind === "glyph");
  if (glyph?.kind !== "glyph" || original?.kind !== "glyph")
    throw new Error("Missing fixture glyph.");
  expect(page.text).toBe("e");
  expect(expected.text).toBe("T");
  expect(glyph.glyph.renderText).toBe("T");
  expect(glyph.glyph.glyphId).toBeGreaterThan(0);
  expect(glyph.glyph.path).toBe(original.glyph.path);
});
test("nested Form expansion and glyph runs share a page execution budget", () => {
  const interpreter = new PdfInterpreter(openPdfDocument(formExpansion(15)), {
    maxOperations: 1000,
  });
  expect(() => interpreter.page(0)).toThrow("execution budget");
  expect(() => interpreter.page(0)).toThrow("execution budget");
  expect(
    new PdfInterpreter(openPdfDocument(formExpansion(4)), { maxOperations: 1000 }).page(0).elements
      .length,
  ).toBe(8);
});
test("JPEG Decode transformations and masks explicitly reject instead of painting unchanged samples", () => {
  const canvas = createCanvas(1, 1);
  canvas.getContext("2d").fillStyle = "red";
  canvas.getContext("2d").fillRect(0, 0, 1, 1);
  for (const extra of [
    "/Decode [1 0 1 0 1 0]",
    "/Mask [0 255 0 255 0 255]",
    "/SMask 6 0 R",
    "/DecodeParms << /ColorTransform 0 >>",
  ]) {
    const input = pdfFixture([
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /XObject << /I 5 0 R >> >> /Contents 4 0 R >>",
      pdfStream("100 0 0 100 0 0 cm /I Do"),
      pdfStream(
        canvas.toBuffer("image/jpeg"),
        `/Type /XObject /Subtype /Image /Width 1 /Height 1 /BitsPerComponent 8 /ColorSpace /DeviceRGB /Filter /DCTDecode ${extra}`,
      ),
    ]);
    try {
      new PdfInterpreter(openPdfDocument(input)).page(0);
      throw new Error("Expected explicit unsupported feature.");
    } catch (error) {
      expect(error).toBeInstanceOf(PdfError);
      expect((error as PdfError).code).toBe("unsupported_feature");
    }
  }
});
