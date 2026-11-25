import { expect, test } from 'bun:test';
import { exportEditedPdf, iteratePdfText, openPdfDocument, PdfEditingFonts, PdfInterpreter, PdfSearchIndex, PdfTextModel, PdfStream } from '../src/index.ts';
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

test('export keeps an unavailable page when text changes on a supported page', async () => {
  const source = document('BT /F 12 Tf 20 200 Td 4 Tr (Second) Tj ET');
  const model = new PdfTextModel();
  const fonts = new PdfEditingFonts();
  fonts.add('Sans-Regular', await Bun.file(new URL('./fixtures/editing-fonts/LiberationSans-Regular.ttf', import.meta.url)).bytes());
  const unavailable: number[] = [];
  expect(new PdfSearchIndex(source).find('First').matches.map((match) => match.page)).toEqual([1]);
  try {
    model.initialize(iteratePdfText(source, (page) => unavailable.push(page)));
    expect(unavailable).toEqual([1]);
    const id = model.ids(0)[0]!;
    model.replace(id, 0, 5, 'Changed');
    const output = openPdfDocument(exportEditedPdf(source, model, fonts));
    expect(output.pages).toHaveLength(2);
    expect(new PdfInterpreter(output).page(0).text).toBe('Changed');
    const before = source.source.resolve(source.pages[1]!.dictionary.get('Contents'));
    const after = output.source.resolve(output.pages[1]!.dictionary.get('Contents'));
    if (!(before instanceof PdfStream) || !(after instanceof PdfStream)) throw new Error('Expected page content streams.');
    expect(output.source.stream(after)).toEqual(source.source.stream(before));
  } finally {
    model.doc.destroy();
  }
});
