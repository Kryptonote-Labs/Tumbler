import type { PdfDocument } from './document.ts';
import { PdfName, PdfReference, PdfString, bytesText, type PdfValue, type PdfDictionary } from './objects.ts';

/** Resolve explicit and named destinations without following cyclic name trees. */
function destination(document: PdfDocument, value: PdfValue, active = new Set<string>()): PdfValue[] | undefined {
  const source = document.source, resolved = source.resolve(value);
  if (Array.isArray(resolved)) return resolved;
  if (resolved instanceof Map && resolved.has('D')) return destination(document, resolved.get('D')!, active);
  const key = resolved instanceof PdfName ? resolved.value : resolved instanceof PdfString ? bytesText(resolved.bytes) : undefined;
  if (key === undefined) return undefined;
  if (active.has(key)) throw new Error('Cyclic PDF named destination.');
  active.add(key);
  try {
    const direct = source.resolve(source.catalog.get('Dests'));
    if (direct instanceof Map && direct.has(key)) return destination(document, direct.get(key)!, active);
    const names = source.resolve(source.catalog.get('Names'));
    const seen = new Set<string>();
    function find(value: PdfValue | undefined): PdfValue | undefined {
      if (value instanceof PdfReference) {
        if (seen.has(value.key)) throw new Error('Cyclic PDF destination tree.');
        seen.add(value.key);
      }
      const node = source.resolve(value);
      if (!(node instanceof Map)) return undefined;
      const entries = source.resolve(node.get('Names'));
      if (Array.isArray(entries)) for (let i = 0; i + 1 < entries.length; i += 2) {
        const name = source.resolve(entries[i]);
        if (name instanceof PdfString && bytesText(name.bytes) === key) return entries[i + 1];
      }
      const children = source.resolve(node.get('Kids'));
      if (Array.isArray(children)) for (const child of children) {
        const result = find(child); if (result !== undefined) return result;
      }
      return undefined;
    }
    const found = names instanceof Map ? find(names.get('Dests')) : undefined;
    return found === undefined ? undefined : destination(document, found, active);
  } finally { active.delete(key); }
}

export interface PdfMergePageCopy {
  document: PdfDocument;
  index: number;
  dictionary: PdfDictionary;
  reference: PdfReference;
}

/** Repeated and interleaved selections target the first output occurrence of the source page. */
export function restoreMergedPdfLinks(pages: PdfMergePageCopy[], resolve: (value: PdfValue | undefined) => PdfValue | undefined) {
  const targets = new Map<string, PdfReference>();
  const identity = (document: PdfDocument, reference: PdfReference) => `${document.source.fingerprint}/${reference.key}`;
  for (const page of pages) {
    const key = identity(page.document, page.document.pages[page.index]!.reference);
    if (!targets.has(key)) targets.set(key, page.reference);
  }
  for (const page of pages) {
    const source = page.document.source;
    const originals = source.resolve(page.document.pages[page.index]!.dictionary.get('Annots'));
    const copies = resolve(page.dictionary.get('Annots'));
    if (!Array.isArray(originals) || !Array.isArray(copies)) continue;
    const remap = (value: PdfValue): PdfValue[] | undefined => {
      const original = destination(page.document, value);
      if (!original || !(original[0] instanceof PdfReference)) return undefined;
      const target = targets.get(identity(page.document, original[0]));
      if (!target) return undefined;
      return [target, ...original.slice(1).map((value) => source.resolve(value) ?? null)];
    };
    originals.forEach((value, index) => {
      const original = source.resolve(value), copy = resolve(copies[index]);
      if (!(original instanceof Map) || !(copy instanceof Map)) return;
      if (original.has('Dest')) {
        const dest = remap(original.get('Dest')!);
        if (dest) copy.set('Dest', dest); else copy.delete('Dest');
      }
      const action = source.resolve(original.get('A'));
      if (action instanceof Map && action.get('S') instanceof PdfName && (action.get('S') as PdfName).value === 'GoTo' && action.has('D')) {
        const dest = remap(action.get('D')!);
        if (dest) copy.set('A', new Map<string, PdfValue>([['S', new PdfName('GoTo')], ['D', dest]]));
        else copy.delete('A');
      }
    });
  }
}
