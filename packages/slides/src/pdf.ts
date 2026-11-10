import { paintPresentationSlide } from './canvas.ts';
import type { SlideCanvasContext, SlideCanvasOptions } from './canvas-types.ts';
import type { PresentationDocument } from './model.ts';

/** A vector PDF backend supplies canvas pages in points and embeds the fonts used by fillText. */
export interface PresentationPdfBackend<Path, Image> {
  beginPage(width: number, height: number): SlideCanvasContext<Path, Image>;
  endPage(): void;
  close(): Uint8Array;
}

/** Reuse the editor's slide painter. CSS pixels become PDF points at 96 dpi. */
export function exportPresentationPdf<Path, Image>(
  document: PresentationDocument,
  backend: PresentationPdfBackend<Path, Image>,
  options: Omit<SlideCanvasOptions<Path, Image>, 'scale'>,
) {
  if (!document.slides.length) throw new Error('Cannot export a presentation without slides.');
  for (const slide of document.slides) {
    const context = backend.beginPage(document.width * 0.75, document.height * 0.75);
    paintPresentationSlide(context, document, slide, { ...options, scale: 0.75 });
    backend.endPage();
  }
  return backend.close();
}
