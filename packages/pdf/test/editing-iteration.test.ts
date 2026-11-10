import { expect, test } from 'bun:test';
import { iteratePdfText, openPdfDocument, PdfTextModel } from '../src/index.ts';
import { pdfFixture, pdfStream } from './pdf-fixture.ts';

function document(second = 'BT /F 12 Tf 20 200 Td (Second) Tj ET') {
  return openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] /MediaBox [0 0 200 300] /Resources << /Font << /F 5 0 R >> >> >>',
    '<< /Type /Page /Parent 2 0 R /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    pdfStream('BT /F 12 Tf 20 200 Td (First) Tj ET'),
    pdfStream(second),
  ]));
}

test('streamed editing import preserves document-wide region identities and page text', () => {
  const model = new PdfTextModel();
  try {
    model.initialize(iteratePdfText(document()));
    expect(model.ids()).toEqual(['source:3 0:0', 'source:4 0:1']);
    expect(model.ids().map((id) => model.text(id).toString())).toEqual(['First', 'Second']);
    expect(model.ids().map((id) => model.seed(id).page)).toEqual([0, 1]);
    expect(model.ids().every((id) => !model.dirty(id))).toBe(true);
  } finally {
    model.doc.destroy();
  }
});

test('a completed page is available before the next page is interpreted', () => {
  const seeds = iteratePdfText(document('BT'));
  const first = seeds.next();
  expect(first.done).toBe(false);
  if (first.done) throw new Error('Expected the first page');
  expect(first.value.delta.map((run) => run.insert).join('')).toBe('First');
  expect(() => seeds.next()).toThrow('Unbalanced PDF content state');
});
