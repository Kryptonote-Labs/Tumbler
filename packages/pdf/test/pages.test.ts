import { test, expect } from 'bun:test';
import * as Y from 'yjs';
import {
  PdfTextModel,
  PdfEditingFonts,
  PdfInterpreter,
  openPdfDocument,
  exportEditedPdf,
  extractPdfPages,
  importPdfText,
  layoutPdfTextFlow,
} from '../src/index.ts';
import { pdfFixture, pdfStream } from './pdf-fixture.ts';
const data = pdfFixture([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 3 /Kids [3 0 R 4 0 R 5 0 R] /MediaBox [0 0 200 300] /Rotate 90 /Resources << /Font << /F 6 0 R >> >> >>',
  '<< /Type /Page /Parent 2 0 R /Contents 7 0 R >>',
  '<< /Type /Page /Parent 2 0 R /Contents 8 0 R >>',
  '<< /Type /Page /Parent 2 0 R /Contents 9 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  pdfStream('BT /F 12 Tf 20 200 Td (FIRST) Tj ET'),
  pdfStream('BT /F 12 Tf 20 200 Td (SECOND SECRET) Tj ET'),
  pdfStream('BT /F 12 Tf 20 200 Td (THIRD) Tj ET'),
]);
const pdf = openPdfDocument(data),
  fonts = new PdfEditingFonts();
fonts.add(
  'Sans-Regular',
  await Bun.file(
    new URL('./fixtures/editing-fonts/LiberationSans-Regular.ttf', import.meta.url),
  ).bytes(),
);
const texts = (doc: typeof pdf) => {
  const interpreter = new PdfInterpreter(doc);
  return doc.pages.map((page) => interpreter.page(page.index).text);
};

test('page reorder, deletion and rotations preserve source ownership and inherited geometry', () => {
  const model = new PdfTextModel();
  model.initialize(importPdfText(pdf));
  model.pages.move(pdf.pages, pdf.pages[2]!.id, pdf.pages[0]!.id);
  model.pages.remove(pdf.pages, [pdf.pages[1]!.id]);
  model.pages.rotate(pdf.pages, [pdf.pages[0]!.id], 90);
  const output = openPdfDocument(exportEditedPdf(pdf, model, fonts));
  expect(texts(output)).toEqual(['THIRD', 'FIRST']);
  expect(output.pages.map((page) => page.rotation)).toEqual([90, 180]);
  expect(model.seed(model.ids(0)[0]!).page).toBe(0);
});

test('blank pages accept text and insertion undo retains immutable identity', () => {
  const model = new PdfTextModel();
  const id = model.pages.insert(pdf.pages, pdf.pages[0]!.id, { width: 400, height: 500 });
  model.undo.stopCapturing();
  model.pages.validate(pdf.pages);
  const blank = model.pages.items(pdf.pages).find((page) => page.id === id)!;
  expect(blank.source.index).toBeLessThan(0);
  model.undo.undo();
  expect(model.pages.items(pdf.pages).some((page) => page.id === id)).toBe(false);
  model.undo.redo();
  model.add({
    id: 'new',
    page: blank.source.index,
    x: 20,
    y: 50,
    width: 200,
    lineHeight: 15,
    style: {
      family: 'Sans',
      size: 12,
      bold: false,
      italic: false,
      underline: false,
      color: '#000000',
    },
    sources: [],
    delta: [],
  });
  model.replace('new', 0, 0, 'Blank text');
  const output = openPdfDocument(exportEditedPdf(pdf, model, fonts));
  expect(output.pages).toHaveLength(4);
  expect(texts(output)[1]).toContain('Blank text');
  expect(output.pages[1]!.width).toBe(400);
});

test('fresh page extraction retains vectors and excludes original revisions and unselected text', () => {
  const extracted = extractPdfPages(pdf, [2, 0]),
    reopened = openPdfDocument(extracted);
  expect(texts(reopened)).toEqual(['THIRD', 'FIRST']);
  expect(new TextDecoder().decode(extracted)).not.toContain('SECOND SECRET');
  expect(reopened.source.revisions).toHaveLength(1);
  expect(reopened.pages[0]!.width).toBe(300);
  expect(() => extractPdfPages(pdf, [0, 0])).toThrow('duplicates');
});

test('concurrent moves and rotation converge without duplicating pages', () => {
  const a = new PdfTextModel(),
    b = new PdfTextModel();
  a.pages.move(pdf.pages, pdf.pages[0]!.id);
  b.pages.move(pdf.pages, pdf.pages[0]!.id, pdf.pages[1]!.id);
  b.pages.rotate(pdf.pages, [pdf.pages[1]!.id], 90);
  const ua = Y.encodeStateAsUpdate(a.doc),
    ub = Y.encodeStateAsUpdate(b.doc);
  Y.applyUpdate(a.doc, ub);
  Y.applyUpdate(b.doc, ua);
  expect(a.pages.items(pdf.pages).map((p) => [p.id, p.rotation])).toEqual(
    b.pages.items(pdf.pages).map((p) => [p.id, p.rotation]),
  );
  expect(new Set(a.pages.items(pdf.pages).map((p) => p.id)).size).toBe(3);
});

test('deleting every page creates one blank page and undo restores the document', () => {
  const model = new PdfTextModel();
  model.pages.remove(
    pdf.pages,
    pdf.pages.map((p) => p.id),
  );
  expect(model.pages.items(pdf.pages)).toHaveLength(1);
  expect(openPdfDocument(exportEditedPdf(pdf, model, fonts)).pages).toHaveLength(1);
  model.undo.undo();
  expect(model.pages.items(pdf.pages).map((p) => p.id)).toEqual(pdf.pages.map((p) => p.id));
});

test('continuation pages can be independently rotated, moved, extracted and deleted', () => {
  const model = new PdfTextModel();
  model.initialize(importPdfText(pdf));
  const id = model.ids(0)[0]!;
  model.replace(id, model.text(id).length, model.text(id).length, '\nMore text'.repeat(40));
  let flow = layoutPdfTextFlow(model, fonts, pdf.pages);
  const continuation = flow.pages.find((p) => p.continuation)!;
  model.pages.rotate(pdf.pages, [continuation.id], 90, flow.pages);
  model.pages.move(pdf.pages, continuation.id, flow.pages[0]!.id, flow.pages);
  flow = layoutPdfTextFlow(model, fonts, pdf.pages);
  expect(flow.pages[0]!.id).toBe(continuation.id);
  const exported = openPdfDocument(exportEditedPdf(pdf, model, fonts));
  expect(exported.pages[0]!.rotation).toBe(180);
  expect(openPdfDocument(extractPdfPages(exported, [0])).pages).toHaveLength(1);
  model.pages.remove(pdf.pages, [continuation.id], flow.pages);
  expect(
    layoutPdfTextFlow(model, fonts, pdf.pages).pages.some((p) => p.id === continuation.id),
  ).toBe(false);
});

test('concurrent first move and rotation of the same page preserve both properties', () => {
  const a = new PdfTextModel(),
    b = new PdfTextModel(),
    id = pdf.pages[0]!.id;
  a.pages.move(pdf.pages, id);
  b.pages.rotate(pdf.pages, [id], 90);
  const ua = Y.encodeStateAsUpdate(a.doc),
    ub = Y.encodeStateAsUpdate(b.doc);
  Y.applyUpdate(a.doc, ub);
  Y.applyUpdate(b.doc, ua);
  expect(a.pages.items(pdf.pages).at(-1)!.id).toBe(id);
  expect(a.pages.items(pdf.pages).find((page) => page.id === id)!.rotation).toBe(90);
  expect(b.pages.items(pdf.pages).map((page) => [page.id, page.rotation])).toEqual(
    a.pages.items(pdf.pages).map((page) => [page.id, page.rotation]),
  );
});

test('deleting all pages retains blank ownership through undo and redo', () => {
  const model = new PdfTextModel();
  model.pages.remove(
    pdf.pages,
    pdf.pages.map((page) => page.id),
  );
  const blank = model.pages.items(pdf.pages)[0]!;
  model.undo.undo();
  expect(model.pages.records.has(blank.id)).toBe(true);
  expect(model.pages.items(pdf.pages)).toHaveLength(3);
  model.undo.redo();
  expect(model.pages.items(pdf.pages).map((page) => page.id)).toEqual([blank.id]);
});

test('every published blank insertion delta validates independently in delivery order', () => {
  const author = new PdfTextModel(),
    peer = new PdfTextModel();
  let deliveries = 0;
  author.doc.on('update', (update: Uint8Array) => {
    Y.applyUpdate(peer.doc, update);
    expect(() => peer.pages.validate(pdf.pages)).not.toThrow();
    deliveries++;
  });
  const id = author.pages.insert(pdf.pages, pdf.pages[0]!.id);
  expect(deliveries).toBeGreaterThanOrEqual(2);
  expect(peer.pages.items(pdf.pages).some((page) => page.id === id)).toBe(true);
});

test('concurrent page deletions converge on one editable blank and undo preserves its peer text', () => {
  const original = openPdfDocument(
    pdfFixture([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << >> /Contents 5 0 R >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << >> /Contents 6 0 R >>',
      pdfStream('10 10 20 20 re f'),
      pdfStream('30 30 20 20 re f'),
    ]),
  );
  const a = new PdfTextModel(),
    b = new PdfTextModel();
  a.pages.remove(original.pages, [original.pages[0]!.id]);
  b.pages.remove(original.pages, [original.pages[1]!.id]);
  const ua = Y.encodeStateAsUpdate(a.doc),
    ub = Y.encodeStateAsUpdate(b.doc);
  Y.applyUpdate(a.doc, ub);
  Y.applyUpdate(b.doc, ua);
  a.pages.validate(original.pages);
  b.pages.validate(original.pages);
  const fallback = a.pages.items(original.pages)[0]!;
  expect(a.pages.items(original.pages)).toHaveLength(1);
  expect(b.pages.items(original.pages).map((page) => page.id)).toEqual([fallback.id]);
  let output = openPdfDocument(exportEditedPdf(original, a, fonts));
  expect(output.pages).toHaveLength(1);
  expect(texts(output)).toEqual(['']);
  b.add({
    id: 'recovery',
    page: fallback.source.index,
    x: 20,
    y: 40,
    width: 100,
    lineHeight: 15,
    style: {
      family: 'Sans',
      size: 12,
      bold: false,
      italic: false,
      underline: false,
      color: '#000000',
    },
    sources: [],
    delta: [],
  });
  b.replace('recovery', 0, 0, 'Peer recovery text');
  Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
  a.undo.undo();
  output = openPdfDocument(exportEditedPdf(original, a, fonts));
  expect(output.pages).toHaveLength(2);
  expect(texts(output).join(' ')).toContain('Peer recovery text');
});

test('page projections are read-only and inactive initialization retains exact source bytes', () => {
  const model = new PdfTextModel();
  let updates = 0;
  model.doc.on('update', () => updates++);
  expect(model.pages.items(pdf.pages)).toHaveLength(3);
  model.pages.sourcePages(pdf.pages);
  layoutPdfTextFlow(model, fonts, pdf.pages);
  expect(updates).toBe(0);
  expect(model.pages.dirty()).toBe(false);
  expect(exportEditedPdf(pdf, model, fonts)).toEqual(data);
  model.pages.initialize(pdf.pages);
  const initializedUpdates = updates;
  expect(model.pages.dirty()).toBe(false);
  expect(exportEditedPdf(pdf, model, fonts)).toEqual(data);
  model.pages.items(pdf.pages);
  model.pages.sourcePages(pdf.pages);
  layoutPdfTextFlow(model, fonts, pdf.pages);
  expect(updates).toBe(initializedUpdates);
  expect(model.pages.initialize(pdf.pages)).toBe(false);
});
