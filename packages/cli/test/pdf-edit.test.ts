import { expect, test } from 'bun:test';
import { openPdfDocument, importPdfText, PdfTextModel, PdfEditingFonts, layoutPdfTextFlow, pdfContinuationHeight } from '@tumblerjs/pdf';
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

test('headless text coordinates stay local to continuation pages', async () => {
  const document = openPdfDocument(await Bun.file(new URL('../../pdf/test/fixtures/page-sequence.pdf', import.meta.url)).bytes());
  const model = new PdfTextModel();
  try {
    model.initialize(importPdfText(document));
    const id = model.ids()[0]!;
    model.replace(id, 0, model.text(id).length, 'line\n'.repeat(100));
    const flow = layoutPdfTextFlow(model, fonts, document.pages);
    const target = flow.pages.find(page => page.continuation === 1)!;
    expect(target).toBeDefined();
    editPdfModel(document, model, fonts, pdfEditInput.parse({ operation: 'add-text', input: { page: target.index + 1, x: 20, y: 30, width: 70, text: 'Added' } }));
    const added = model.ids().find(key => model.text(key).toString() === 'Added')!;
    expect(model.geometry(added).y).toBe(30 + pdfContinuationHeight(target.source));
    editPdfModel(document, model, fonts, pdfEditInput.parse({ operation: 'place-text', input: { id: added, y: 40 } }));
    expect(model.geometry(added).y).toBe(40 + pdfContinuationHeight(target.source));
  } finally { model.doc.destroy(); }
});
