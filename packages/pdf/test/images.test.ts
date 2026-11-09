import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { PdfTextModel, PdfEditingFonts, PdfInterpreter, openPdfDocument, exportEditedPdf } from '../src/index.ts';
import { pdfFixture, pdfStream } from './pdf-fixture.ts';
const fixture = (rotation = 0) => openPdfDocument(pdfFixture([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /CropBox [10 20 190 180] /Rotate ${rotation} /Resources << >> /Contents 4 0 R >>`,
  pdfStream('0 0 0 rg 0 0 2 2 re f'),
]));
const image = { page: 0, continuation: 0, asset: 'durable-asset', x: 24, y: 32, width: 40, height: 20, rotation: 0 as const };
const pixels = { width: 2, height: 1, rgba: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]) };
test('image placement syncs references, and a move is one undoable change', () => {
  const model = new PdfTextModel(), peer = new PdfTextModel();
  try {
    model.images.place('image', image); model.undo.stopCapturing();
    const initial = Y.encodeStateAsUpdate(model.doc);
    Y.applyUpdate(peer.doc, initial);
    const vector = Y.encodeStateVector(model.doc);
    model.images.move('image', 7, 9); model.undo.stopCapturing();
    Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(model.doc, vector));
    expect(peer.images.get('image')).toEqual({ ...image, x: 31, y: 41 });
    model.undo.undo(); expect(model.images.get('image')).toEqual(image);
    model.undo.redo(); expect(model.images.get('image')?.x).toBe(31);
    expect(initial.length).toBeLessThan(400);
    model.images.duplicate('image', 'copy'); model.images.rotate('copy'); model.images.hide('image');
    expect(model.images.get('copy')).toMatchObject({ asset: image.asset, rotation: 90, x: 53, width: 20, height: 40 });
    expect(model.images.get('image')?.hidden).toBe(true);
  } finally { model.doc.destroy(); peer.doc.destroy(); }
});
for (const rotation of [0, 90, 180, 270] as const) test(`image export preserves crop and ${rotation}-degree source orientation`, async () => {
  const document = fixture(rotation), model = new PdfTextModel();
  try {
    model.pages.initialize(document.pages); model.images.place('image', image);
    const bytes = exportEditedPdf(document, model, new PdfEditingFonts(), () => pixels);
    const exported = openPdfDocument(bytes), scene = new PdfInterpreter(exported).page(0);
    const rendered = scene.elements.find(element => element.kind === 'image');
    expect(rendered?.kind).toBe('image');
    if (rendered?.kind === 'image') {
      expect(rendered.image.rgba).toEqual(new Uint8ClampedArray(pixels.rgba));
    }
    expect(exported.pages[0]?.cropBox).toEqual(document.pages[0]?.cropBox);
    expect(exported.pages[0]?.rotation).toBe(rotation);
    await Bun.write(`/tmp/pdf-images-${rotation}.pdf`, bytes);
  } finally { model.doc.destroy(); }
});
