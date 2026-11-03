import { expect, test } from 'bun:test';
import { pdfFixture, pdfStream } from './pdf-fixture.ts';
import {
  openPdfDocument,
  PdfTextModel,
  importPdfText,
  PdfEditingFonts,
  exportEditedPdf,
  PdfInterpreter,
} from '../src/index.ts';
const fonts = new PdfEditingFonts();
fonts.add(
  'Sans-Regular',
  await Bun.file(
    new URL('./fixtures/editing-fonts/LiberationSans-Regular.ttf', import.meta.url),
  ).bytes(),
);
function document(content: string) {
  return openPdfDocument(
    pdfFixture([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F 5 0 R >> >> /Contents 4 0 R >>',
      pdfStream(content),
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    ]),
  );
}
test('editing a mixed-colour paragraph preserves the colour of every unchanged glyph', () => {
  const pdf = document('BT /F 12 Tf 20 150 Td 1 0 0 rg (Red) Tj 0 0 1 rg (Blue) Tj ET'),
    model = new PdfTextModel();
  model.initialize(importPdfText(pdf));
  const id = model.ids()[0]!;
  model.replace(id, 7, 7, '!');
  const original = new PdfInterpreter(pdf).page(0).elements.filter((e) => e.kind === 'glyph');
  const edited = new PdfInterpreter(openPdfDocument(exportEditedPdf(pdf, model, fonts)))
    .page(0)
    .elements.filter((e) => e.kind === 'glyph');
  expect(edited.map((e) => e.glyph.unicode).join('')).toBe('RedBlue!');
  expect(edited.slice(0, 7).map((e) => e.state.fill)).toEqual(original.map((e) => e.state.fill));
  expect(edited[7]!.state.fill).toBe(original[6]!.state.fill);
  model.doc.destroy();
});
