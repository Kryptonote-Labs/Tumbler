import { openPdfDocument, PdfError, type PdfDocument } from '@tumblerjs/pdf';
import { mergePageSelection } from './merge-selection.ts';

export type PdfMergeSource = {
  id: number; name: string; bytes?: Uint8Array; document?: PdfDocument | undefined;
  password: string; pages: string; none: boolean; loading: boolean; error: string; locked: boolean;
};
export type PdfMergeResult = { name?: string; href?: string };
export type PdfMergeRead = Uint8Array | ((signal: AbortSignal) => Promise<Uint8Array>);

export function openMergeSource(source: PdfMergeSource) {
  if (!source.bytes) return;
  try {
    source.document = openPdfDocument(source.bytes, source.password ? { password: source.password } : {});
    if (!source.document.pages.length) throw new Error('This PDF has no pages.');
    source.error = '';
    source.locked = false;
  } catch (cause) {
    source.document = undefined;
    source.error = cause instanceof Error ? cause.message : 'Could not open this PDF.';
    source.locked = cause instanceof PdfError && ['password_required', 'invalid_password'].includes(cause.code);
  }
}
export function mergeSourceSelection(source: PdfMergeSource) {
  return mergePageSelection(source.pages, source.document?.pages.length ?? 0, source.none);
}
export function mergeSourceSummary(source: PdfMergeSource) {
  if (source.loading) return 'Reading PDF…';
  if (!source.document) return source.locked ? 'Password required' : 'Could not open PDF';
  const selection = mergeSourceSelection(source), count = source.document.pages.length;
  if (selection.error) return 'Check page selection';
  if (!selection.pages.length) return 'No pages selected';
  if (selection.custom) return `${selection.pages.length} pages · Custom order`;
  return selection.pages.length === count ? `All ${count} pages` : `${selection.pages.length} of ${count} pages`;
}
