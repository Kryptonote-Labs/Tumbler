import { openPdfDocument } from '../document.ts';
import { PdfName, PdfReference, PdfStream, type PdfValue, type PdfDictionary } from '../objects.ts';
import type { PdfWriter } from './object-writer.ts';

const snapshots = new WeakMap<Uint8Array, ReturnType<typeof openPdfDocument>>();
export function pdfPageSnapshot(bytes: Uint8Array) {
  let document = snapshots.get(bytes);
  if (!document) { document = openPdfDocument(bytes); snapshots.set(bytes, document); }
  return document;
}

/** Copy a frozen page graph into a new owner. References, including annotation back-references, stay local. */
export function copyPdfPageSnapshot(writer: PdfWriter, bytes: Uint8Array, target: PdfReference, links = new Map<string, PdfReference>()) {
  const document = pdfPageSnapshot(bytes), page = document.pages[0]!;
  const refs = new Map<string, PdfReference>([...links, [page.reference.key, target]]);
  function copy(value: PdfValue): PdfValue {
    if (value instanceof PdfReference) {
      const known = refs.get(value.key);
      if (known) return known;
      const ref = writer.value(null);
      refs.set(value.key, ref);
      const resolved = document.source.resolve(value);
      if (resolved instanceof PdfStream) {
        writer.stream(resolved.encoded, copy(resolved.dictionary) as PdfDictionary, ref, true);
      } else writer.value(copy(resolved), ref);
      return ref;
    }
    if (Array.isArray(value)) return value.map(copy);
    if (value instanceof Map) return new Map([...value].map(([key, entry]) => [key, copy(entry)]));
    return value;
  }
  const dictionary = new Map(page.dictionary);
  dictionary.delete('Parent');
  dictionary.delete('Contents');
  dictionary.delete('Resources');
  const result = copy(dictionary) as PdfDictionary;
  const form = writer.stream(document.contents(page), new Map<string, PdfValue>([
    ['Type', new PdfName('XObject')], ['Subtype', new PdfName('Form')],
    ['BBox', [...page.mediaBox]], ['Resources', copy(page.resources)],
  ]));
  result.set('Contents', writer.stream(new TextEncoder().encode('q /KNSnapshot Do Q')));
  result.set('Resources', new Map([['XObject', new Map([['KNSnapshot', form]])]]));
  return result;
}
