export { decodeInkTrace, encodeInkTrace, InkError, type InkChannel, type InkPoint, type InkValue } from './trace.ts';
export { readOfficeInk, type OfficeInkDocument, type OfficeInkTrace, type InkDiagnostic } from './document.ts';
export { applyInkRasterOperation, INK_RASTER_OPERATIONS, type InkBrush, type InkRasterOperation } from './brush.ts';
export { INKML_NAMESPACE } from './xml.ts';
export { replaceOfficeInkTrace } from './edit.ts';
export { renderOfficeInkSvg, type InkSvgResult, type InkBounds } from './render.ts';
