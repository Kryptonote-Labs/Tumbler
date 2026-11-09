import type { PdfDocument, PdfPage } from '../document.ts';
import { PdfNavigation, type PdfLink } from '../navigation.ts';
import { PdfReference } from '../objects.ts';
import type { PdfTextModel } from './model.ts';
import { pdfPageSnapshot } from './page-snapshot.ts';

/** Resolve frozen-page links against the copied pages' collaborative identities. */
export function pdfModelLinks(document: PdfDocument, model: PdfTextModel, page: PdfPage): PdfLink[] {
  if (page.index >= 0) return new PdfNavigation(document).links(page);
  const record = model.pages.records.get(page.id), snapshot = record?.get('snapshot');
  if (!(snapshot instanceof Uint8Array)) return [];
  const source = pdfPageSnapshot(snapshot);
  const links = record?.get('snapshotLinks') as Record<string, string> | undefined;
  const pages = model.pages.sourcePages(document.pages);
  const targets = Object.entries(links ?? {}).flatMap(([key, id]) => {
    const target = pages.find(page => page.id === id);
    const [object, generation] = key.split(' ').map(Number);
    return target ? [{ ...target, id: key, reference: new PdfReference(object!, generation) }] : [];
  });
  return new PdfNavigation({ ...source, pages: targets }).links(source.pages[0]!).flatMap(link => {
    if (link.target.kind === 'external') return [link];
    const id = links?.[link.target.pageId];
    return id ? [{ ...link, target: { ...link.target, pageId: id } }] : [];
  });
}
