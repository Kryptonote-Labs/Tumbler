import type { PdfDocument } from "@tumblerjs/pdf";
import { PdfPageRenderer } from "./page-renderer.ts";

const renderers = new WeakMap<PdfDocument, { renderer: PdfPageRenderer; references: number }>();
/** Visible thumbnails share one bounded render queue per source document. */
export function thumbnailRenderer(document: PdfDocument) {
  let entry = renderers.get(document);
  if (!entry) {
    entry = { renderer: new PdfPageRenderer(document), references: 0 };
    renderers.set(document, entry);
  }
  entry.references++;
  const current = entry;
  return {
    renderer: current.renderer,
    release() {
      if (--current.references === 0) {
        renderers.delete(document);
        current.renderer.destroy();
      }
    },
  };
}
