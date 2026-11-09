import { openPdfDocument, type PdfDocument } from '../document.ts';
import { PdfName, type PdfValue, PdfReference, unsupported } from '../objects.ts';
import type { PdfTextModel } from './model.ts';
import { PdfWriter } from './object-writer.ts';
import { copyPdfPageSnapshot } from './page-snapshot.ts';
import { extractPdfPages } from './extract.ts';

/** Page-only changes copy object references and never interpret content streams or load fonts. */
export function exportPdfPageState(document: PdfDocument, model: PdfTextModel): Uint8Array {
  if (document.source.trailer.has('Encrypt'))
    unsupported('Encrypted PDF editing requires an encryption-aware writer.');
  const writer = new PdfWriter(document),
    pages = model.pages.items(document.pages),
    parent = writer.value(new Map<string, PdfValue>([['Type', new PdfName('Pages')]]));
  if (!pages.length) throw new Error('PDF page changes leave no visible pages. Add a blank page.');
  const outputRefs = new Map(pages.map(page => [page.id, page.source.index < 0 ? writer.value(null) : page.source.reference]));
  const refs = pages.map((page) => {
    const source = page.source,
      info =
        source.index < 0
          ? new Map<string, PdfValue>([['Type', new PdfName('Page')]])
          : new Map(source.dictionary);
    const snapshot = model.pages.records.get(page.id)?.get('snapshot');
    const target = outputRefs.get(page.id)!;
    if (snapshot instanceof Uint8Array) {
      const links = model.pages.records.get(page.id)?.get('snapshotLinks') as Record<string, string> | undefined;
      const references = new Map(Object.entries(links ?? {}).flatMap(([key, id]) => {
        const reference = outputRefs.get(id);
        return reference ? [[key, reference] as const] : [];
      }));
      for (const [key, value] of copyPdfPageSnapshot(writer, snapshot, target, references)) info.set(key, value);
    }
    info.set('Parent', parent);
    if (!(snapshot instanceof Uint8Array)) info.set('Resources', source.resources);
    info.set('MediaBox', [...source.mediaBox]);
    info.set('CropBox', [...source.cropBox]);
    info.set('Rotate', (source.rotation + page.rotation) % 360);
    info.set('UserUnit', source.userUnit);
    return writer.value(info, target);
  });
  writer.value(
    new Map<string, PdfValue>([
      ['Type', new PdfName('Pages')],
      ['Kids', refs],
      ['Count', refs.length],
    ]),
    parent,
  );
  const catalog = new Map(document.source.catalog),
    root = document.source.trailer.get('Root');
  if (!(root instanceof PdfReference)) throw new Error('Invalid PDF catalog reference.');
  catalog.set('Pages', parent);
  writer.value(catalog, root);
  const output = writer.finish();
  if (document.pages.some((page) => !pages.some((item) => item.id === page.id))) {
    const current = openPdfDocument(output);
    return extractPdfPages(
      current,
      current.pages.map((page) => page.index),
    );
  }
  return output;
}
