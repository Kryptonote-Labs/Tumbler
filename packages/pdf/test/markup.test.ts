import { test, expect } from 'bun:test';
import * as Y from 'yjs';
import {
  openPdfDocument,
  PdfTextModel,
  PdfEditingFonts,
  exportEditedPdf,
  importPdfMarkup,
  pdfMarkupFromRects,
  pdfMarkupDisplayQuads,
  PdfInterpreter,
} from '../src/index.ts';
import { pdfFixture } from './pdf-fixture.ts';
const fixture = () =>
  openPdfDocument(
    pdfFixture([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [10 20 210 320] /Rotate 90 /Resources << >> /Annots [4 0 R] >>',
      '<< /Type /Annot /Subtype /Highlight /Rect [20 40 80 60] /QuadPoints [20 60 80 60 20 40 80 40] /C [1 1 0] /Contents (keep me) >>',
    ]),
  );
test('all markup types export as editable annotations with appearances; deletion preserves source', () => {
  const pdf = fixture(),
    model = new PdfTextModel();
  const imported = importPdfMarkup(pdf)[0]!;
  for (const kind of ['Highlight', 'Underline', 'StrikeOut'] as const)
    model.annotations.set({ ...imported, id: kind, kind, color: '#ff0000' });
  model.annotations.set({ ...imported, hidden: true });
  const output = openPdfDocument(exportEditedPdf(pdf, model, new PdfEditingFonts()));
  expect(importPdfMarkup(output).map((a) => a.kind)).toEqual([
    'Highlight',
    'Underline',
    'StrikeOut',
  ]);
  expect(new PdfInterpreter(output).page(0).elements.length).toBeGreaterThan(0);
  expect(importPdfMarkup(pdf)).toHaveLength(1);
});
test('viewport quads round trip on rotated cropped pages', () => {
  const pdf = fixture(),
    page = pdf.pages[0]!,
    base = importPdfMarkup(pdf)[0]!;
  const quads = pdfMarkupFromRects(page, [{ x: 12, y: 25, width: 30, height: 10 }]);
  expect(pdfMarkupDisplayQuads(page, { ...base, quads })[0]).toEqual([
    12, 25, 42, 25, 12, 35, 42, 35,
  ]);
});
test('remote annotation changes survive local undo and concurrent colour edits merge with deletion', () => {
  const pdf = fixture(),
    a = new PdfTextModel(),
    b = new PdfTextModel(),
    markup = importPdfMarkup(pdf)[0]!;
  a.annotations.set(markup);
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
  a.undo.stopCapturing();
  a.annotations.set({ ...markup, color: '#00ff00' });
  b.annotations.set({ ...markup, hidden: true });
  Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
  a.undo.undo();
  expect(a.annotations.items(pdf)[0]!.hidden).toBe(true);
  expect(a.annotations.items(pdf)[0]!.color).toBe('#ffff00');
});
test('validation rejects non-finite quads and unknown page ownership', () => {
  const model = new PdfTextModel(),
    markup = importPdfMarkup(fixture())[0]!;
  expect(() => model.annotations.set({ ...markup, quads: [[NaN, 0, 0, 0, 0, 0, 0, 0]] })).toThrow();
  model.annotations.set(markup);
  expect(() => model.annotations.validate(new Set([9]))).toThrow();
});
test('independent edits of an imported annotation merge without replacing shared ownership', () => {
  const pdf = fixture(),
    a = new PdfTextModel(),
    b = new PdfTextModel(),
    id = importPdfMarkup(pdf)[0]!.id;
  a.annotations.update(pdf, id, { color: '#123456' });
  b.annotations.update(pdf, id, { hidden: true });
  Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
  expect(a.annotations.items(pdf)).toEqual(b.annotations.items(pdf));
  expect(a.annotations.items(pdf)[0]).toMatchObject({ color: '#123456', hidden: true });
});
