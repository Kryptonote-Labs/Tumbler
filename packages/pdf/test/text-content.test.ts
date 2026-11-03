import { expect, test } from "bun:test";
import { openPdfDocument, PdfInterpreter, pdfTextContent } from "../src/index.ts";
import { pdfFixture, pdfStream } from "./pdf-fixture.ts";
import { extractionFixture } from "./extraction-fixture.ts";

const content = async (name: string) => {
  const document = openPdfDocument(
    new Uint8Array(
      await Bun.file(new URL(`./fixtures/${name}.pdf`, import.meta.url)).arrayBuffer(),
    ),
  );
  return pdfTextContent(new PdfInterpreter(document).page(0));
};
function textPage(commands: string) {
  return pdfFixture([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 160] /Resources << /Font << /F 5 0 R >> >> /Contents 4 0 R >>",
    pdfStream(commands),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ]);
}
test("selection text retains exact glyph positions and Unicode source identity", async () => {
  const page = await content("basic-text");
  expect(page.text).toBe("Hello Alex");
  const glyph = page.items.find((item) => item.kind === "glyph")!;
  expect(glyph.transform).toEqual([14, 0, 0, 14, 24, 50]);
  expect(glyph.width).toBeCloseTo(0.722, 3);
  expect(glyph.source.object.object).toBeGreaterThan(0);
});
test("TJ gaps become spaces while explicit character spacing stays inside words", async () => {
  expect((await content("positioned-text")).text).toBe("Hello Alex");
  const document = openPdfDocument(textPage("BT /F 14 Tf 5 Tc 24 110 Td (ABC) Tj ET"));
  expect(pdfTextContent(new PdfInterpreter(document).page(0)).text).toBe("ABC");
});
test("separate baselines become copyable line breaks and geometric LTR order fixes reversed paint order", async () => {
  expect((await content("tagged-order")).text).toBe("FIRST SECOND");
  const document = openPdfDocument(
    textPage("BT /F 14 Tf 24 110 Td (First line) Tj 0 -20 Td (Second line) Tj ET"),
  );
  expect(pdfTextContent(new PdfInterpreter(document).page(0)).text).toBe("First line\nSecond line");
});
test("ligatures, astral Unicode and existing hidden OCR remain extractable; image-only pages are empty", async () => {
  expect((await content("unicode-map")).text).toBe("Ωffi😀");
  expect((await content("hidden-ocr")).text).toBe("SCAN");
  expect((await content("image-only")).items).toEqual([]);
});
test("copy text uses ToUnicode even when the painted glyph differs", async () => {
  const document = openPdfDocument(await extractionFixture());
  expect(pdfTextContent(new PdfInterpreter(document).page(0)).text).toBe("e");
});
test("rotated and cropped pages retain their viewport geometry in the selection projection", async () => {
  const page = await content("inherited-page");
  expect([page.width, page.height]).toEqual([140, 240]);
  const item = page.items.find((item) => item.kind === "glyph")!;
  expect(item.transform[0]).toBe(0);
  expect(item.transform[1]).toBe(14);
  expect(item.transform[2]).toBe(-14);
  expect(item.transform[3]).toBe(0);
});

test("selection resolves indirect font metrics", () => {
  const document = openPdfDocument(
    pdfFixture([
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 160] /Resources << /Font << /F 5 0 R >> >> /Contents 4 0 R >>",
      pdfStream("BT /F 14 Tf 24 110 Td (A) Tj ET"),
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /FontDescriptor 6 0 R >>",
      "<< /Type /FontDescriptor /FontName /Helvetica /Ascent 7 0 R /Descent 8 0 R >>",
      "900",
      "-250",
    ]),
  );
  const item = pdfTextContent(new PdfInterpreter(document).page(0)).items[0]!;
  expect(item.ascent).toBe(0.9);
  expect(item.height).toBe(1.15);
});
