import { expect, test } from 'bun:test';
import { openPdfDocument, PdfInterpreter } from '../src/index.ts';
import { pdfFixture, pdfStream } from './pdf-fixture.ts';

function document(samples = new Uint8Array([20, 80])) {
  return openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << /Font << /F 4 0 R >> /XObject << /Im 6 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    pdfStream('BT /F 12 Tf 20 200 Td (Before) Tj ET q 20 0 0 10 0 0 cm /Im Do Q BT /F 12 Tf 20 180 Td (After) Tj ET'),
    pdfStream(samples, '/Type /XObject /Subtype /Image /Width 2 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8'),
  ]));
}

test('deferred images preserve element order, glyph source identity and decoded pixels', () => {
  const pdf = document();
  const eager = new PdfInterpreter(pdf).page(0);
  const deferred = new PdfInterpreter(pdf, undefined, { deferImages: true }).page(0);
  expect(deferred.text).toBe('BeforeAfter');
  expect(deferred.elements.map((element) => [element.id, element.source, element.kind])).toEqual(
    eager.elements.map((element) => [element.id, element.source, element.kind]),
  );
  const image = deferred.elements.find((element) => element.kind === 'image')!;
  const original = eager.elements.find((element) => element.kind === 'image')!;
  expect(image.image).toEqual(original.image);
  expect(image.image).toBe(image.image);
  expect(structuredClone(image.image)).toEqual(original.image);
});

test('text inspection defers pixel validation until an image is requested', () => {
  const pdf = document(new Uint8Array([20]));
  expect(() => new PdfInterpreter(pdf).page(0)).toThrow('shorter than');
  const scene = new PdfInterpreter(pdf, undefined, { deferImages: true }).page(0);
  expect(scene.text).toBe('BeforeAfter');
  const image = scene.elements.find((element) => element.kind === 'image')!;
  expect(() => image.image).toThrow('shorter than');
});

test('inline images remain available to renderers after deferred text inspection', () => {
  const pdf = openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Contents 4 0 R >>',
    pdfStream('BI /W 1 /H 1 /CS /RGB /BPC 8 ID \x01\x02\x03 EI'),
  ]));
  const scene = new PdfInterpreter(pdf, undefined, { deferImages: true }).page(0);
  const image = scene.elements.find((element) => element.kind === 'image')!;
  expect(image.image.rgba).toEqual(new Uint8ClampedArray([1, 2, 3, 255]));
});
