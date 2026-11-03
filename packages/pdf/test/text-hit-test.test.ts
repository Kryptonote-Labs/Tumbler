import { expect, test } from "bun:test";
import {
  openPdfDocument,
  PdfInterpreter,
  pdfTextContent,
  PdfTextSelectionIndex,
} from "../src/index.ts";
import { pdfFixture, pdfStream } from "./pdf-fixture.ts";

function page(commands: string) {
  return pdfTextContent(
    new PdfInterpreter(
      openPdfDocument(
        pdfFixture([
          "<< /Type /Catalog /Pages 2 0 R >>",
          "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 500] /Resources << /Font << /F 5 0 R >> >> /Contents 4 0 R >>",
          pdfStream(commands),
          "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        ]),
      ),
    ).page(0),
  );
}
test("interline carets use adjacent geometry despite a footer painted before the body", () => {
  const content = page(
    "BT /F 9 Tf 40 20 Td (Footer) Tj ET BT /F 16 Tf 40 430 Td (Heading) Tj ET BT /F 11 Tf 40 402 Td (First paragraph line) Tj 0 -15 Td (Second paragraph line) Tj ET",
  );
  const index = new PdfTextSelectionIndex(content);
  const lines = content.items.filter((item) => item.kind === "glyph");
  const first = lines.find((item) => item.text === "F" && item.transform[5] === 98)!;
  const second = lines.find((item) => item.text === "S")!;
  const firstBottom = first.transform[5] + first.transform[3] * (first.height - first.ascent),
    secondTop = second.transform[5] - second.transform[3] * second.ascent;
  for (const fraction of [0.1, 0.3, 0.7, 0.9]) {
    const caret = index.caretAt(40, firstBottom + (secondTop - firstBottom) * fraction)!;
    const item = content.items.find((item) => item.id === caret.id)!;
    expect(item.transform[5]).toBe(fraction < 0.5 ? 98 : 113);
  }
});
test("line margins clamp to a short line's endpoint instead of another line", () => {
  const content = page(
      "BT /F 14 Tf 40 430 Td (Short) Tj 0 -25 Td (A longer line beneath it) Tj ET",
    ),
    index = new PdfTextSelectionIndex(content);
  const end = content.items.find((item) => item.text === "t")!;
  expect(index.caretAt(450, 65)).toEqual({ id: end.id, offset: 1 });
});
test("rotated carets follow the source matrix", () => {
  const content = page("BT /F 14 Tf 0 1 -1 0 100 200 Tm (ABC) Tj ET"),
    index = new PdfTextSelectionIndex(content);
  const glyphs = content.items.filter((item) => item.kind === "glyph");
  for (const [i, item] of glyphs.entries()) {
    const [a, b, c, d, e, f] = item.transform,
      next = glyphs[i + 1];
    // Adjacent glyphs share a logical caret boundary; either DOM endpoint represents it.
    const boundaries = [{ id: item.id, offset: 1 }, ...(next ? [{ id: next.id, offset: 0 }] : [])];
    expect(boundaries).toContainEqual(
      index.caretAt(e + a * item.width * 0.8 - c * 0.25, f + b * item.width * 0.8 - d * 0.25)!,
    );
  }
});
test("caret offsets never split an astral character or a combining grapheme", async () => {
  const document = openPdfDocument(
      await Bun.file(new URL("./fixtures/unicode-map.pdf", import.meta.url)).bytes(),
    ),
    content = pdfTextContent(new PdfInterpreter(document).page(0));
  const emoji = content.items.find((item) => item.text === "😀")!;
  const index = new PdfTextSelectionIndex(content),
    [a, b, , , e, f] = emoji.transform;
  expect(index.caretAt(e + a * emoji.width * 0.8, f + b * emoji.width * 0.8)).toEqual({
    id: emoji.id,
    offset: 2,
  });
  const combined = { ...emoji, text: "a\u0301" },
    composedIndex = new PdfTextSelectionIndex({
      ...content,
      items: [combined],
      text: combined.text,
    });
  expect(composedIndex.caretAt(e + a * emoji.width * 0.8, f + b * emoji.width * 0.8)).toEqual({
    id: emoji.id,
    offset: 2,
  });
});
