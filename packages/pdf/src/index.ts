export { PdfSource } from "./source.ts";
export { PdfDocument, openPdfDocument } from "./document.ts";
export type { PdfPage, PdfBox } from "./document.ts";
export { PdfError, PdfName, PdfReference, PdfString, PdfStream } from "./objects.ts";
export type { PdfValue, PdfDictionary } from "./objects.ts";
export { PdfInterpreter, interpretPdfPage } from "./interpreter.ts";
export { paintPdfPage } from "./canvas-paint.ts";
export { browserPdfPaintHost } from "./browser.ts";
export type { PdfCanvasContext, PdfPaintHost, PdfPaintOptions } from "./canvas-paint.ts";
export type {
  PdfPageScene,
  PdfSceneElement,
  PdfGlyphElement,
  PdfImageData,
  PdfPathElement,
  PdfPaintState,
} from "./scene.ts";

export type { PdfExecutionLimits } from "./execution-budget.ts";
export { pdfTextContent } from "./text-content.ts";
export type { PdfTextContent, PdfTextItem } from "./text-content.ts";
export { PdfTextSelectionIndex } from "./text-hit-test.ts";
export type { PdfTextCaret } from "./text-hit-test.ts";

export * from "./editing/fonts.ts";
export * from "./editing/model.ts";
export * from "./editing/layout.ts";

export { exportEditedPdf } from "./editing/writer.ts";
export { placePdfScene, placePdfSceneSources, pdfScenePlacements, type PdfScenePlacement } from "./editing/placement.ts";

export { PdfPageModel, type PdfManagedPage } from "./editing/pages.ts";
export { extractPdfPages } from "./editing/extract.ts";

export { PdfSearchIndex } from "./search.ts";
export type { PdfSearchMatch, PdfSearchOptions, PdfSearchRect, PdfSearchResult } from "./search.ts";

export { mergePdfDocuments, parsePdfPageSelection } from './merge.ts';
export type { PdfMergeInput } from './merge.ts';
export { deletePdfModelPages } from './editing/page-operations.ts';

export { createEditablePdfCopy } from "./editing/editable-copy.ts";
