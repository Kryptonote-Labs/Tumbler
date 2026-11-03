import { openPdfDocument, PdfStream } from "../src/index.ts";
import { dictionary } from "../src/objects.ts";
import { pdfFixture, pdfStream } from "./pdf-fixture.ts";

export async function extractionFixture(mapped = "e") {
  const input = openPdfDocument(
    new Uint8Array(
      await Bun.file(new URL("./fixtures/chromium-typography.pdf", import.meta.url)).arrayBuffer(),
    ),
  );
  const source = input.source,
    fonts = dictionary(source.resolve(input.pages[0]!.resources.get("Font")));
  const font = dictionary(source.resolve([...fonts.values()][0]));
  const descendants = source.resolve(font.get("DescendantFonts"));
  if (!Array.isArray(descendants)) throw new Error("Expected an embedded CID font.");
  const descriptor = dictionary(
    source.resolve(dictionary(source.resolve(descendants[0])).get("FontDescriptor")),
  );
  const program = source.resolve(descriptor.get("FontFile2"));
  if (!(program instanceof PdfStream)) throw new Error("Expected a TrueType program.");
  return pdfFixture([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /Font << /F 5 0 R >> >> /Contents 4 0 R >>",
    pdfStream("BT /F 70 Tf 10 10 Td (T) Tj ET"),
    "<< /Type /Font /Subtype /TrueType /BaseFont /Inter /Encoding /WinAnsiEncoding /FirstChar 84 /LastChar 84 /Widths [650] /FontDescriptor 6 0 R /ToUnicode 8 0 R >>",
    "<< /Type /FontDescriptor /FontName /Inter /Flags 32 /FontBBox [-1000 -1000 2000 2000] /ItalicAngle 0 /Ascent 1000 /Descent -200 /CapHeight 1000 /StemV 80 /FontFile2 7 0 R >>",
    pdfStream(source.stream(program)),
    pdfStream(
      `1 begincodespacerange <00> <FF> endcodespacerange 1 beginbfchar <54> <${mapped.charCodeAt(0).toString(16).padStart(4, "0")}> endbfchar`,
    ),
  ]);
}
