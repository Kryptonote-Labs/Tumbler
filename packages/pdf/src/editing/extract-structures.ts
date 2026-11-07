import type { PdfSource } from '../source.ts';
import {
  PdfName,
  PdfReference,
  PdfString,
  type PdfValue,
  type PdfDictionary,
  dictionary,
  unsupported,
} from '../objects.ts';

export type PdfExtractionContext = {
  source: PdfSource;
  selectedPages: ReadonlySet<string>;
  selectedAnnotations: ReadonlySet<string>;
  selectedObjects: ReadonlySet<string>;
  refs: Map<string, PdfReference>;
  reserve: () => PdfReference;
  set: (ref: PdfReference, value: PdfValue) => void;
  copy: (value: PdfValue) => PdfValue;
  copyAction: (value: PdfValue | undefined) => PdfValue | undefined;
};
const compareBytes = (a: Uint8Array, b: Uint8Array) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return a.length - b.length;
};
const kind = (value: PdfValue | undefined, expected: string) =>
  value instanceof PdfName && value.value === expected;

/** Retain only form fields with a widget on a selected page, preserving their field ancestors and resources. */
export function subsetPdfForms(context: PdfExtractionContext): PdfValue | undefined {
  const { source, refs, reserve, copy, set, selectedAnnotations } = context;
  const original = source.resolve(source.catalog.get('AcroForm'));
  if (!(original instanceof Map)) return undefined;
  if (original.has('XFA'))
    unsupported('Extracting pages from an XFA form requires reconstructing its XML form data.');
  const active = new Set<string>(),
    kept = new Set<string>();
  function field(
    value: PdfValue,
    parent?: PdfReference,
    inheritedType?: PdfValue,
  ): PdfReference | undefined {
    if (!(value instanceof PdfReference))
      throw new Error('PDF form fields must be indirect objects.');
    if (active.has(value.key)) throw new Error('Cyclic PDF form field tree.');
    active.add(value.key);
    const info = dictionary(source.resolve(value)),
      ref = reserve();
    const fieldType = info.has('FT') ? source.resolve(info.get('FT')) : inheritedType;
    refs.set(value.key, ref);
    const originalKids = source.resolve(info.get('Kids'));
    const kids = Array.isArray(originalKids)
      ? originalKids.flatMap((kid) => {
          const result = field(kid, ref, fieldType);
          return result ? [result] : [];
        })
      : [];
    const widget = kind(info.get('Subtype'), 'Widget') && selectedAnnotations.has(value.key);
    active.delete(value.key);
    if (!widget && !kids.length) {
      set(ref, null);
      return undefined;
    }
    kept.add(value.key);
    const result = new Map<string, PdfValue>();
    for (const [key, entry] of info) {
      if (['Parent', 'Kids'].includes(key) || (key === 'V' && kind(fieldType, 'Sig'))) continue;
      result.set(key, copy(entry));
    }
    if (parent) result.set('Parent', parent);
    if (kids.length) result.set('Kids', kids);
    set(ref, result);
    return ref;
  }
  const originalFields = source.resolve(original.get('Fields'));
  const fields = Array.isArray(originalFields)
    ? originalFields.flatMap((value) => {
        const result = field(value);
        return result ? [result] : [];
      })
    : [];
  const result = new Map<string, PdfValue>();
  for (const [key, value] of original) {
    if (['Fields', 'CO', 'SigFlags'].includes(key)) continue;
    result.set(key, copy(value));
  }
  result.set('Fields', fields);
  const calculations = source.resolve(original.get('CO'));
  if (Array.isArray(calculations))
    result.set(
      'CO',
      calculations
        .filter((value) => value instanceof PdfReference && kept.has(value.key))
        .map(copy),
    );
  return result;
}

/** Subset the tagged structure and its reverse page/annotation lookup without carrying excluded-page semantic content. */
export function subsetPdfTags(
  context: PdfExtractionContext,
  parentKeys: ReadonlySet<number>,
): PdfReference | undefined {
  const { source, refs, reserve, copy, set, selectedPages, selectedObjects } = context;
  const originalValue = source.catalog.get('StructTreeRoot'),
    original = source.resolve(originalValue);
  if (!(original instanceof Map)) return undefined;
  const root = reserve();
  if (originalValue instanceof PdfReference) refs.set(originalValue.key, root);
  const active = new Set<string>(),
    identities: { id: PdfString; reference: PdfReference }[] = [];
  const selected = (value: PdfValue | undefined) =>
    value instanceof PdfReference && selectedPages.has(value.key);
  function kids(
    value: PdfValue | undefined,
    parent: PdfReference,
    page: PdfValue | undefined,
  ): PdfValue[] {
    const resolved = source.resolve(value);
    if (Array.isArray(resolved)) return resolved.flatMap((child) => kids(child, parent, page));
    if (typeof resolved === 'number') return selected(page) ? [resolved] : [];
    if (!(resolved instanceof Map)) return [];
    const ownPage = resolved.get('Pg') ?? page;
    if (kind(resolved.get('Type'), 'MCR')) return selected(ownPage) ? [copy(resolved)] : [];
    if (kind(resolved.get('Type'), 'OBJR')) {
      const object = resolved.get('Obj');
      return object instanceof PdfReference && selectedObjects.has(object.key)
        ? [copy(resolved)]
        : [];
    }
    const key = value instanceof PdfReference ? value.key : undefined;
    if (key && active.has(key)) throw new Error('Cyclic PDF accessibility structure.');
    if (key) active.add(key);
    const ref = reserve();
    if (key) refs.set(key, ref);
    const children = kids(resolved.get('K'), ref, ownPage);
    if (key) active.delete(key);
    if (!children.length) {
      set(ref, null);
      return [];
    }
    const result = new Map<string, PdfValue>();
    for (const [name, entry] of resolved)
      if (!['P', 'Pg', 'K', 'Ref'].includes(name)) result.set(name, copy(entry));
    result.set('P', parent);
    result.set('K', children);
    if (selected(ownPage)) result.set('Pg', copy(ownPage!));
    set(ref, result);
    const id = resolved.get('ID');
    if (id instanceof PdfString) identities.push({ id, reference: ref });
    return [ref];
  }
  const children = kids(original.get('K'), root, undefined);
  const entries = new Map<number, PdfValue>(),
    seen = new Set<string>();
  function parentTree(value: PdfValue | undefined) {
    if (value instanceof PdfReference) {
      if (seen.has(value.key)) throw new Error('Cyclic PDF structure parent tree.');
      seen.add(value.key);
    }
    const node = source.resolve(value);
    if (!(node instanceof Map)) return;
    const nums = source.resolve(node.get('Nums'));
    if (Array.isArray(nums))
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const key = nums[i];
        if (typeof key === 'number' && parentKeys.has(key)) entries.set(key, copy(nums[i + 1]!));
      }
    const children = source.resolve(node.get('Kids'));
    if (Array.isArray(children)) for (const child of children) parentTree(child);
  }
  parentTree(original.get('ParentTree'));
  const result = new Map<string, PdfValue>([
    ['Type', new PdfName('StructTreeRoot')],
    ['K', children],
    [
      'ParentTree',
      new Map<string, PdfValue>([
        ['Nums', [...entries].sort(([a], [b]) => a - b).flatMap(([key, value]) => [key, value])],
      ]),
    ],
  ]);
  result.set(
    'ParentTreeNextKey',
    [...entries.keys()].reduce((max, value) => Math.max(max, value), -1) + 1,
  );
  for (const name of ['RoleMap', 'ClassMap', 'Namespaces'])
    if (original.has(name)) result.set(name, copy(original.get(name)!));
  if (identities.length)
    result.set(
      'IDTree',
      new Map<string, PdfValue>([
        [
          'Names',
          identities
            .sort((a, b) => compareBytes(a.id.bytes, b.id.bytes))
            .flatMap((item) => [item.id, item.reference]),
        ],
      ]),
    );
  set(root, result);
  return root;
}
