import { exportEditedPdf } from './writer.ts';
import { extractPdfPages } from './extract.ts';
import { openPdfDocument, type PdfDocument } from '../document.ts';
import { parsePdfPageSelection } from '../merge.ts';
import { layoutPdfTextFlow } from './layout.ts';
import type { PdfTextModel } from './model.ts';
import type { PdfEditingFonts } from './fonts.ts';

/** Delete numbered pages from the current collaborative layout, retaining source identities and undo. */
export function deletePdfModelPages(document: PdfDocument, model: PdfTextModel, fonts: PdfEditingFonts, selection: string) {
  const pages = layoutPdfTextFlow(model, fonts, document.pages).pages;
  const indices = parsePdfPageSelection(selection, pages.length);
  if (new Set(indices).size !== indices.length) throw new Error('PDF page selection contains duplicates.');
  if (indices.length === pages.length) throw new Error('At least one PDF page must remain.');
  model.pages.remove(document.pages, indices.map(index => pages[index]!.id), pages);
  return { deletedPages: indices.map(index => index + 1).sort((a, b) => a - b), pageCount: pages.length - indices.length };
}

/** Duplicate the visible selection as independent frozen pages, including current text edits and continuations. */
export function duplicatePdfModelPages(document: PdfDocument, model: PdfTextModel, fonts: PdfEditingFonts, ids: readonly string[]) {
  const pages = layoutPdfTextFlow(model, fonts, document.pages).pages;
  if (ids.some(id => !pages.some(page => page.id === id))) throw new Error('Unknown PDF page.');
  const selected = pages.flatMap((page, index) => ids.includes(page.id) ? [index] : []);
  if (!selected.length) return [];
  const snapshot = openPdfDocument(exportEditedPdf(document, model, fonts));
  const copies = selected.map(index => extractPdfPages(snapshot, [index]));
  model.undo.stopCapturing();
  try { return model.pages.insertSnapshots(document.pages, copies, pages[selected.at(-1)!]!.id, pages); }
  finally { model.undo.stopCapturing(); }
}
