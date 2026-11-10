import { expect, test } from 'bun:test';
import { PDFDocument, Path2D, type SKRSContext2D } from '@napi-rs/canvas';
import { openPdfDocument, PdfInterpreter } from '../../pdf/src/index.ts';
import { applyPresentationCommand, createPresentation, exportPresentationPdf } from '../src/index.ts';

test('PDF export retains hidden slides, physical page size and vector geometry', () => {
  let deck = createPresentation({ width: 960, height: 720 });
  deck = applyPresentationCommand(deck, {
    name: 'insert-object', slideId: deck.document.slides[0]!.id,
    bounds: { x: 100, y: 100, width: 400, height: 300 },
    object: { kind: 'shape', geometry: 'rect', fill: '#ff0000' },
  });
  deck = applyPresentationCommand(deck, { name: 'insert-slide', index: 1 });
  deck = applyPresentationCommand(deck, {
    name: 'set-slide-hidden', slideId: deck.document.slides[1]!.id, hidden: true,
  });
  const pdf = new PDFDocument();
  const bytes = exportPresentationPdf<Path2D, never>(deck.document, {
    // Native PDF contexts expose SKRS drawImage but omit it in the declaration.
    beginPage: (width, height) => pdf.beginPage(width, height) as SKRSContext2D,
    endPage: () => pdf.endPage(),
    close: () => pdf.close(),
  }, { path: (path) => new Path2D(path) });
  const document = openPdfDocument(bytes);
  expect(document.pages).toHaveLength(2);
  expect(document.pages.map((page) => page.mediaBox)).toEqual([[0, 0, 720, 540], [0, 0, 720, 540]]);
  expect(new PdfInterpreter(document).page(0).elements.some((element) => element.kind === 'path')).toBe(true);
});
