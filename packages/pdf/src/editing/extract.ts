import type { PdfDocument } from '../document.ts';
import {
  PdfName,
  PdfReference,
  PdfStream,
  PdfString,
  bytesText,
  type PdfDictionary,
  type PdfValue,
  dictionary,
  unsupported,
} from '../objects.ts';
import { subsetPdfOutlines } from './extract-outlines.ts';
import { subsetPdfForms, subsetPdfTags, type PdfExtractionContext } from './extract-structures.ts';
import { bytes, serializePdfValue } from './object-writer.ts';

/** Copy selected pages into a fresh object graph. No original revisions or unselected page streams are retained. */
export function extractPdfPages(document: PdfDocument, indices: readonly number[]): Uint8Array {
  if (
    !indices.length ||
    indices.some((index) => !Number.isSafeInteger(index) || !document.pages[index])
  )
    throw new Error('Select at least one valid PDF page.');
  if (new Set(indices).size !== indices.length)
    throw new Error('PDF page selection contains duplicates.');
  const source = document.source,
    objects: (PdfValue | { data: Uint8Array; dictionary: PdfDictionary })[] = [],
    refs = new Map<string, PdfReference>();
  const reserve = () => {
    objects.push(null);
    return new PdfReference(objects.length);
  };
  const catalog = reserve(),
    parent = reserve();
  const selected = indices.map((index) => document.pages[index]!),
    pageRefs = selected.map((page) => {
      const ref = reserve();
      refs.set(page.reference.key, ref);
      return ref;
    });
  const excluded = new Set(
    document.pages
      .filter((page) => !refs.has(page.reference.key))
      .map((page) => page.reference.key),
  );
  for (const page of document.pages.filter((page) => excluded.has(page.reference.key))) {
    const annotations = source.resolve(page.dictionary.get('Annots'));
    if (Array.isArray(annotations))
      for (const annotation of annotations)
        if (annotation instanceof PdfReference) excluded.add(annotation.key);
  }
  const selectedPageKeys = new Set(selected.map((page) => page.reference.key));
  const excludedValue = (value: PdfValue | undefined) =>
    value instanceof PdfReference && !selectedPageKeys.has(value.key);
  function copy(value: PdfValue): PdfValue {
    if (value instanceof PdfReference) {
      if (excluded.has(value.key)) return null;
      const existing = refs.get(value.key);
      if (existing) return existing;
      const original = source.resolve(value);
      if (original instanceof Map) {
        const type = original.get('Type');
        if (type instanceof PdfName && type.value === 'Page' && !selectedPageKeys.has(value.key))
          return null;
      }
      if (
        original instanceof Map &&
        original.get('Type') instanceof PdfName &&
        (original.get('Type') as PdfName).value === 'StructElem'
      )
        return null;
      const ref = reserve();
      refs.set(value.key, ref);
      if (original instanceof PdfStream)
        objects[ref.object - 1] = {
          data: source.encodedStream(original),
          dictionary: copyDictionary(original.dictionary),
        };
      else objects[ref.object - 1] = copy(original);
      return ref;
    }
    if (value instanceof PdfStream) {
      const ref = reserve();
      objects[ref.object - 1] = {
        data: source.encodedStream(value),
        dictionary: copyDictionary(value.dictionary),
      };
      return ref;
    }
    if (Array.isArray(value)) return value.map(copy);
    if (value instanceof Map) return copyDictionary(value);
    return value;
  }
  const resolvingDestinations = new Set<string>();
  function destination(value: PdfValue): PdfValue | undefined {
    const resolved = source.resolve(value);
    if (Array.isArray(resolved)) return excludedValue(resolved[0]) ? undefined : copy(resolved);
    if (resolved instanceof Map && resolved.has('D')) return destination(resolved.get('D')!);
    const key =
      resolved instanceof PdfName
        ? resolved.value
        : resolved instanceof PdfString
          ? bytesText(resolved.bytes)
          : undefined;
    if (key) {
      if (resolvingDestinations.has(key)) throw new Error('Cyclic PDF named destination.');
      resolvingDestinations.add(key);
      try {
        const dests = source.resolve(source.catalog.get('Dests'));
        if (dests instanceof Map && dests.has(key)) return destination(dests.get(key)!);
        const names = source.resolve(source.catalog.get('Names'));
        const active = new Set<string>();
        const find = (value: PdfValue | undefined): PdfValue | undefined => {
          if (value instanceof PdfReference) {
            if (active.has(value.key)) throw new Error('Cyclic PDF destination tree.');
            active.add(value.key);
          }
          const node = source.resolve(value);
          if (!(node instanceof Map)) return undefined;
          const entries = source.resolve(node.get('Names'));
          if (Array.isArray(entries))
            for (let i = 0; i + 1 < entries.length; i += 2) {
              const name = source.resolve(entries[i]);
              if (name instanceof PdfString && bytesText(name.bytes) === key) return entries[i + 1];
            }
          const children = source.resolve(node.get('Kids'));
          if (Array.isArray(children))
            for (const child of children) {
              const found = find(child);
              if (found !== undefined) return found;
            }
          return undefined;
        };
        if (names instanceof Map) {
          const found = find(names.get('Dests'));
          if (found !== undefined) return destination(found);
        }
      } finally {
        resolvingDestinations.delete(key);
      }
    }
    return undefined;
  }
  function copyDictionary(original: PdfDictionary): PdfDictionary {
    const result = new Map<string, PdfValue>();
    const type = source.resolve(original.get('Type'));
    const subtype = source.resolve(original.get('Subtype'));
    const annotation = (type instanceof PdfName && type.value === 'Annot') ||
      (subtype instanceof PdfName && original.has('Rect'));
    const outline = source.resolve(original.get('Title')) instanceof PdfString;
    const actionType = source.resolve(original.get('S'));
    const goto = actionType instanceof PdfName && actionType.value === 'GoTo';
    for (const [key, value] of original) {
      // Page back-references never pull a page tree or another page into this standalone file.
      if (
        key === 'Parent' &&
        source.resolve(original.get('Type')) instanceof PdfName &&
        (source.resolve(original.get('Type')) as PdfName).value === 'Page'
      )
        continue;

      if ((key === 'Dest' && (annotation || outline)) || (key === 'D' && goto)) {
        const dest = destination(value);
        if (dest) result.set(key, dest);
        continue;
      }
      // Actions can appear under /A, additional-action events, /Next or arrays.
      // Resolve their destinations wherever the action dictionary occurs, retaining
      // the remaining entries (including chained actions).
      if (key === 'Next' && actionType instanceof PdfName) {
        const chain = source.resolve(value);
        if (Array.isArray(chain)) {
          const retained = chain.filter((entry) => {
            const action = source.resolve(entry);
            if (!(action instanceof Map)) return true;
            const kind = source.resolve(action.get('S'));
            if (!(kind instanceof PdfName) || kind.value !== 'GoTo') return true;
            const target = action.get('D');
            return target !== undefined && destination(target) !== undefined;
          });
          if (retained.length) result.set(key, retained.map(copy));
          continue;
        }
      }
      const action = source.resolve(value);
      if (action instanceof Map) {
        const kind = source.resolve(action.get('S'));
        if (kind instanceof PdfName && kind.value === 'GoTo') {
          const target = action.get('D');
          if (target === undefined || destination(target) === undefined) continue;
        }
      }
      result.set(key, copy(value));
    }
    return result;
  }
  const selectedAnnotations = new Set<string>(),
    parentKeys = new Set<number>();
  const scannedResources = new Set<string>(), selectedResources = new Set<string>();
  function resourceParentKeys(value: PdfValue | undefined) {
    if (value instanceof PdfReference) {
      if (scannedResources.has(value.key)) return;
      scannedResources.add(value.key);
      const resolved = source.resolve(value);
      if (resolved instanceof PdfStream) selectedResources.add(value.key);
      resourceParentKeys(resolved);
    } else if (value instanceof PdfStream) resourceParentKeys(value.dictionary);
    else if (Array.isArray(value)) value.forEach(resourceParentKeys);
    else if (value instanceof Map) {
      // Tagged Form XObjects (including nested resources/appearance streams) own
      // ParentTree entries independently of the page that invokes them.
      for (const name of ['StructParents', 'StructParent']) {
        const key = source.resolve(value.get(name));
        if (typeof key === 'number') parentKeys.add(key);
      }
      const type = source.resolve(value.get('Type'));
      const kind = type instanceof PdfName ? type.value : '';
      const annotation = kind === 'Annot' ||
        (source.resolve(value.get('Subtype')) instanceof PdfName && value.has('Rect'));
      const field = source.resolve(value.get('FT')) instanceof PdfName;
      for (const [key, child] of value) {
        // These names are also valid resource names. Only treat them as ownership
        // links in dictionaries whose types give them that meaning.
        if (key === 'Parent' && (['Page', 'Pages'].includes(kind) || annotation || field)) continue;
        if (key === 'P' && (annotation || kind === 'StructElem')) continue;
        if (key === 'Pg' && ['StructElem', 'MCR', 'OBJR'].includes(kind)) continue;
        resourceParentKeys(child);
      }
    }
  }
  for (const page of selected) {
    resourceParentKeys(page.resources);
    const key = source.resolve(page.dictionary.get('StructParents'));
    if (typeof key === 'number') parentKeys.add(key);
    const annotations = source.resolve(page.dictionary.get('Annots'));
    if (Array.isArray(annotations))
      for (const value of annotations) {
        if (value instanceof PdfReference) selectedAnnotations.add(value.key);
        const annotation = source.resolve(value);
        if (annotation instanceof Map) {
          resourceParentKeys(annotation.get('AP'));
          const key = source.resolve(annotation.get('StructParent'));
          if (typeof key === 'number') parentKeys.add(key);
        }
      }
  }
  const context: PdfExtractionContext = {
    source,
    selectedPages: new Set(selected.map((page) => page.reference.key)),
    selectedAnnotations,
    selectedObjects: new Set([...selectedAnnotations, ...selectedResources]),
    refs,
    reserve,
    set: (ref, value) => {
      objects[ref.object - 1] = value;
    },
    copy,
  };
  const forms = subsetPdfForms(context),
    tags = subsetPdfTags(context, parentKeys),
    outlines = subsetPdfOutlines(context, destination);
  selected.forEach((page, index) => {
    const info = copyDictionary(page.dictionary);
    info.set('Type', new PdfName('Page'));
    info.set('Parent', parent);
    info.set('Resources', copy(page.resources));
    info.set('MediaBox', [...page.mediaBox]);
    info.set('CropBox', [...page.cropBox]);
    info.set('Rotate', page.rotation);
    info.set('UserUnit', page.userUnit);
    objects[pageRefs[index]!.object - 1] = info;
  });
  objects[parent.object - 1] = new Map<string, PdfValue>([
    ['Type', new PdfName('Pages')],
    ['Kids', pageRefs],
    ['Count', selected.length],
  ]);
  const catalogInfo = new Map<string, PdfValue>([
    ['Type', new PdfName('Catalog')],
    ['Pages', parent],
  ]);
  if (forms) catalogInfo.set('AcroForm', forms);
  if (outlines) catalogInfo.set('Outlines', outlines);
  if (tags) {
    catalogInfo.set('StructTreeRoot', tags);
    catalogInfo.set('MarkInfo', new Map<string, PdfValue>([['Marked', true]]));
  }
  for (const name of ['Lang', 'OCProperties', 'OutputIntents'])
    if (source.catalog.has(name)) catalogInfo.set(name, copy(source.catalog.get(name)!));
  objects[catalog.object - 1] = catalogInfo;
  const chunks: Uint8Array[] = [bytes(`%PDF-${source.version}\n%\xE2\xE3\xCF\xD3\n`)],
    offsets = [0];
  let position = chunks[0]!.length;
  objects.forEach((value, index) => {
    offsets.push(position);
    const header = bytes(`${index + 1} 0 obj\n`),
      tail = bytes('\nendobj\n');
    let data: Uint8Array;
    if (value !== null && typeof value === 'object' && 'data' in value) {
      const dictionary = new Map(value.dictionary);
      dictionary.set('Length', value.data.length);
      const start = bytes(serializePdfValue(dictionary) + '\nstream\n'),
        end = bytes('\nendstream');
      data = new Uint8Array(start.length + value.data.length + end.length);
      data.set(start);
      data.set(value.data, start.length);
      data.set(end, start.length + value.data.length);
    } else data = bytes(serializePdfValue(value as PdfValue));
    chunks.push(header, data, tail);
    position += header.length + data.length + tail.length;
  });
  const xref = position;
  chunks.push(
    bytes(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
        offsets
          .slice(1)
          .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
          .join('') +
        `trailer\n<< /Size ${objects.length + 1} /Root ${catalog.object} 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
    ),
  );
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    output.set(chunk, at);
    at += chunk.length;
  }
  return output;
}
