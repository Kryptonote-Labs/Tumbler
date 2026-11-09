import { expect, test } from 'bun:test';
import { openPdfDocument, importPdfText, PdfTextModel, PdfEditingFonts } from '@tumblerjs/pdf';
import { editPdfModel, inspectPdfModel, pdfEditInput } from '../src/pdf-edit.ts';

const fonts = new PdfEditingFonts();
fonts.add(
  'Sans-Regular',
  await Bun.file(
    new URL('../../pdf/test/fixtures/editing-fonts/LiberationSans-Regular.ttf', import.meta.url),
  ).bytes(),
);

test('headless PDF commands inspect, edit and undo the shared model', async () => {
  const document = openPdfDocument(
    await Bun.file(new URL('../../pdf/test/fixtures/page-sequence.pdf', import.meta.url)).bytes(),
  );
  const model = new PdfTextModel();
  try {
    model.initialize(importPdfText(document));
    const before = inspectPdfModel(document, model, fonts, 1);
    const id = before.regions[0]!.id;
    editPdfModel(
      document,
      model,
      fonts,
      pdfEditInput.parse({ operation: 'replace-text', input: { id, text: 'Changed' } }),
    );
    expect(model.text(id).toString()).toBe('Changed');
    model.undo.undo();
    expect(model.text(id).toString()).toBe(before.regions[0]!.text);
    expect(() =>
      pdfEditInput.parse({ operation: 'format-text', input: { id, style: { size: -1 } } }),
    ).toThrow();
    expect(() =>
      pdfEditInput.parse({ operation: 'replace-text', input: { id, text: 'x', nonsense: true } }),
    ).toThrow();
  } finally {
    model.doc.destroy();
  }
});
