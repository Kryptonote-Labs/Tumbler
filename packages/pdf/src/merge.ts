import { openPdfDocument, type PdfDocument } from './document.ts';
import { PdfName, PdfReference, PdfStream, type PdfDictionary, type PdfValue } from './objects.ts';
import { extractPdfPages } from './editing/extract.ts';
import { bytes, serializePdfValue } from './editing/object-writer.ts';
import { restoreMergedPdfLinks, type PdfMergePageCopy } from './merge-links.ts';
import { mergePdfCatalogs } from './merge-catalogs.ts';

export interface PdfMergePart {
  document: PdfDocument;
  /** Zero-based pages in output order. Omit to include every page. Repeat a part to reuse pages. */
  pages?: readonly number[] | undefined;
}

/** Expand one-based page numbers and inclusive ranges, preserving order and repetitions. */
export function selectPdfPages(selection: string, pageCount: number): number[] {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new Error('PDF has no selectable pages.');
  const result: number[] = [];
  for (const part of selection.split(',')) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) throw new Error('Use page numbers or ranges, such as 3,1-2 or 4-2.');
    const start = Number(match[1]), end = Number(match[2] ?? match[1]);
    if (![start, end].every((n) => Number.isSafeInteger(n) && n >= 1 && n <= pageCount))
      throw new Error(`Select pages within 1-${pageCount}.`);
    const step = start <= end ? 1 : -1;
    for (let page = start; ; page += step) {
      if (result.length >= 100000) throw new Error('Select at most 100000 pages.');
      result.push(page - 1);
      if (page === end) break;
    }
  }
  return result;
}

/** Merge pages without rendering. Sources stay unchanged; output is a standalone, unencrypted PDF. */
export function mergePdfPages(parts: readonly PdfMergePart[]): Uint8Array {
  if (!parts.length) throw new Error('Select at least one PDF.');
  const objects: PdfValue[] = [null, null];
  const reserve = () => { objects.push(null); return new PdfReference(objects.length); };
  const root = new PdfReference(1), parent = new PdfReference(2);
  const pages: PdfReference[] = [];
  const pageCopies: PdfMergePageCopy[] = [];
  const catalogs: PdfDictionary[] = [];
  let total = 0;
  for (const part of parts) {
    const indices = part.pages ?? part.document.pages.map((_, index) => index);
    if (!indices.length || indices.some((i) => !Number.isSafeInteger(i) || i < 0 || !part.document.pages[i]))
      throw new Error('Select at least one valid PDF page per source.');
    total += indices.length;
    if (total > 100000) throw new Error('Merge at most 100000 pages.');
    // Separate repeated selections so each occurrence owns its annotations and page references.
    const batches: number[][] = [];
    let batch: number[] = [];
    const seen = new Set<number>();
    for (const index of indices) {
      if (seen.has(index)) { batches.push(batch); batch = []; seen.clear(); }
      batch.push(index); seen.add(index);
    }
    batches.push(batch);
    for (const selection of batches) {
      const doc = openPdfDocument(extractPdfPages(part.document, selection));
      const refs = new Map<string, PdfReference>();
      function copy(value: PdfValue): PdfValue {
        if (value instanceof PdfReference) {
          const found = refs.get(value.key);
          if (found) return found;
          const ref = reserve();
          refs.set(value.key, ref);
          objects[ref.object - 1] = copy(doc.source.resolve(value) ?? null);
          return ref;
        }
        if (value instanceof PdfStream)
          return new PdfStream(copyDict(value.dictionary), doc.source.encodedStream(value), new PdfReference(0));
        if (value instanceof Map) return copyDict(value);
        if (Array.isArray(value)) return value.map(copy);
        return value;
      }
      function copyDict(value: PdfDictionary): PdfDictionary {
        return new Map([...value].map(([key, item]) => [key, copy(item)]));
      }
      // Reserve all page identities before copying links or structure trees.
      for (const page of doc.pages) refs.set(page.reference.key, reserve());
      for (const page of doc.pages) {
        const ref = refs.get(page.reference.key)!;
        const info = new Map(page.dictionary);
        info.delete('Parent');
        const copied = copyDict(info);
        copied.set('Parent', parent);
        objects[ref.object - 1] = copied;
        pages.push(ref);
        pageCopies.push({ document: part.document, index: selection[page.index]!, dictionary: copied, reference: ref });
      }
      const catalog = new Map(doc.source.catalog);
      catalog.delete('Pages');
      catalogs.push(copyDict(catalog));
    }
  }
  const resolve = (value: PdfValue | undefined): PdfValue | undefined => {
    const seen = new Set<number>();
    while (value instanceof PdfReference) {
      if (seen.has(value.object)) throw new Error('Cyclic merged reference.');
      seen.add(value.object); value = objects[value.object - 1];
    }
    return value;
  };
  const catalog = mergePdfCatalogs(catalogs, objects, reserve, resolve);
  restoreMergedPdfLinks(pageCopies, resolve);
  catalog.set('Type', new PdfName('Catalog')); catalog.set('Pages', parent);
  objects[0] = catalog;
  objects[1] = new Map<string, PdfValue>([['Type', new PdfName('Pages')], ['Kids', pages], ['Count', pages.length]]);
  const chunks: Uint8Array[] = [bytes('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n')], offsets = [0];
  let position = chunks[0]!.length;
  for (const [index, value] of objects.entries()) {
    offsets.push(position);
    const head = bytes(`${index + 1} 0 obj\n`), tail = bytes('\nendobj\n');
    let data: Uint8Array;
    if (value instanceof PdfStream) {
      const info = new Map(value.dictionary); info.set('Length', value.encoded.length);
      const start = bytes(serializePdfValue(info) + '\nstream\n'), end = bytes('\nendstream');
      data = new Uint8Array(start.length + value.encoded.length + end.length);
      data.set(start); data.set(value.encoded, start.length); data.set(end, start.length + value.encoded.length);
    } else data = bytes(serializePdfValue(value));
    chunks.push(head, data, tail); position += head.length + data.length + tail.length;
  }
  chunks.push(bytes(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`));
  const output = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0; for (const chunk of chunks) { output.set(chunk, at); at += chunk.length; }
  return output;
}
