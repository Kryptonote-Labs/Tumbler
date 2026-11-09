import type { PdfDocument } from '@tumblerjs/pdf';

// Keep this aligned with extractPdfPages. Export may intentionally produce a subset,
// but overwriting the source must not silently discard unsupported document data.
const supportedCatalogKeys = new Set([
  'Type', 'Pages', 'AcroForm', 'Outlines', 'StructTreeRoot', 'MarkInfo',
  'Lang', 'OCProperties', 'OutputIntents',
]);
const supportedTrailerKeys = new Set([
  'Size', 'Root', 'Prev', 'XRefStm', 'ID',
  // Cross-reference stream dictionaries also serve as trailers.
  'Type', 'W', 'Index', 'Length', 'Filter', 'DecodeParms',
]);

/** Reject data the page extractor cannot retain before any replacement is written. */
export function checkPdfDeletionSupported(document: PdfDocument): void {
  const source = document.source;
  const unsupported: string[] = [];
  for (const key of source.catalog.keys())
    if (!supportedCatalogKeys.has(key)) unsupported.push(`catalog /${key}`);
  for (const key of source.trailer.keys())
    if (!supportedTrailerKeys.has(key)) unsupported.push(`trailer /${key}`);
  // Names/Dests are deliberately absent above: resolving referenced destinations
  // does not preserve the original name trees (including embedded attachments).
  if (source.catalog.has('MarkInfo')) {
    const value = source.resolve(source.catalog.get('MarkInfo'));
    if (!(value instanceof Map)) unsupported.push('catalog /MarkInfo');
    else for (const key of value.keys())
      if (key !== 'Marked') unsupported.push(`/MarkInfo /${key}`);
  }
  if (unsupported.length)
    throw new Error(
      `Cannot safely delete PDF pages: unsupported document structures (${unsupported.join(', ')}). The original file has not been changed.`,
    );
}
