import { openPdfDocument, type PdfDocument } from './document.ts';
import { extractPdfPages } from './editing/extract.ts';
import { bytes, serializePdfValue } from './editing/object-writer.ts';
import { PdfName, PdfReference, PdfStream, PdfString, bytesText, dictionary, type PdfDictionary, type PdfValue, integer, unsupported } from './objects.ts';

export interface PdfMergeInput {
  readonly document: PdfDocument;
  /** Zero-based indices in output order. Omit to include every page. Repetitions are allowed. */
  readonly pages?: readonly number[];
}

/** Parse one-based pages and inclusive ranges, retaining written order and repetitions. */
export function parsePdfPageSelection(selection: string, pageCount: number): number[] {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new Error('PDF has no selectable pages.');
  const ranges = selection.split(',').map((part) => {
    const match = /^\s*([0-9]+)\s*(?:-\s*([0-9]+)\s*)?$/.exec(part);
    if (!match) throw new Error('Use comma-separated PDF pages or ranges, such as 3,1-2,5-4.');
    const first = Number(match[1]), last = Number(match[2] ?? match[1]);
    if (![first, last].every((n) => Number.isSafeInteger(n) && n >= 1 && n <= pageCount))
      throw new Error(`PDF page selection is outside the document (1-${pageCount}).`);
    return [first, last] as const;
  });
  const result: number[] = [];
  for (const [first, last] of ranges) {
    const step = first <= last ? 1 : -1;
    for (let page = first; ; page += step) {
      result.push(page - 1);
      if (page === last) break;
    }
  }
  return result;
}

type OutputObject = PdfValue | { data: Uint8Array; dictionary: PdfDictionary };

/** Merge page object graphs without interpreting or rasterizing their content streams.
 * Document-level metadata is not combined. Fields are grouped under source1, source2, ... .
 * Repeated pages start an independent copy, including their annotations and form fields.
 */
export function mergePdfDocuments(inputs: readonly PdfMergeInput[]): Uint8Array {
  if (!inputs.length) throw new Error('Select at least one PDF document.');
  const parts: PdfDocument[] = [];
  let version = '1.7';
  for (const { document, pages = document.pages.map((_, i) => i) } of inputs) {
    if (!pages.length || pages.some((i) => !Number.isSafeInteger(i) || i < 0 || !document.pages[i]))
      throw new Error('Select at least one valid PDF page from each document.');
    if (Number(document.source.version) > Number(version)) version = document.source.version;
    // Signed values cannot survive a newly composed file, and must never silently disappear.
    const visited = new Set<string>();
    function check(value: PdfValue | undefined) {
      if (value instanceof PdfReference) {
        if (visited.has(value.key)) return;
        visited.add(value.key);
        check(document.source.resolve(value));
      } else if (Array.isArray(value)) value.forEach(check);
      else if (value instanceof Map) {
        const ft = document.source.resolve(value.get('FT'));
        if (ft instanceof PdfName && ft.value === 'Sig') unsupported('Merging PDF signature fields is not supported.');
        const kind = document.source.resolve(value.get('S'));
        if (kind instanceof PdfName && kind.value === 'JavaScript' && document.source.catalog.has('AcroForm'))
          unsupported('Merging scripted PDF forms is not supported because field names are namespaced.');
        for (const entry of value.values()) check(entry);
      }
    }
    check(document.source.catalog.get('AcroForm'));
    check(document.source.catalog.get('Names'));
    // Each independent graph has unique page identities. Split at repetitions so a duplicate
    // never shares mutable annotations, widgets, or structure ownership with its original.
    let group: number[] = [], seen = new Set<number>();
    const flush = () => { if (group.length) parts.push(openPdfDocument(extractPdfPages(document, group))); };
    for (const index of pages) {
      if (seen.has(index)) { flush(); group = []; seen = new Set(); }
      group.push(index); seen.add(index);
    }
    flush();
  }
  const objects: OutputObject[] = [];
  const reserve = () => { objects.push(null); return new PdfReference(objects.length); };
  const put = (ref: PdfReference, value: OutputObject) => { objects[ref.object - 1] = value; };
  const catalogRef = reserve(), pagesRef = reserve(), structureRef = reserve(), outlinesRef = reserve();
  const outputPages: PdfReference[] = [], fields: PdfValue[] = [], calculations: PdfValue[] = [],
    formResources = new Map<string, PdfValue>(), structureKids: PdfValue[] = [], parentEntries: PdfValue[] = [],
    roleMap = new Map<string, PdfValue>(), classMap = new Map<string, PdfValue>(), namespaces: PdfValue[] = [],
    identities: PdfValue[] = [], outlineItems: PdfReference[] = [], ocgs: PdfValue[] = [],
    on: PdfValue[] = [], off: PdfValue[] = [], order: PdfValue[] = [], rbGroups: PdfValue[] = [],
    locked: PdfValue[] = [], usages: PdfValue[] = [], configs: PdfValue[] = [], outputIntents: PdfValue[] = [];
  let parentOffset = 0, needAppearances = false;
  const catalog = new Map<string, PdfValue>([['Type', new PdfName('Catalog')], ['Pages', pagesRef]]);
  parts.forEach((document, sourceIndex) => {
    const source = document.source, refs = new Map<string, PdfReference>(), prefix = `source${sourceIndex + 1}`;
    const resourceNames = new Map<string, string>();
    const sourceStruct = source.resolve(source.catalog.get('StructTreeRoot'));
    const sourceRoles = sourceStruct instanceof Map ? source.resolve(sourceStruct.get('RoleMap')) : null;
    const sourceClasses = sourceStruct instanceof Map ? source.resolve(sourceStruct.get('ClassMap')) : null;
    const roleName = (value: PdfValue): PdfValue => value instanceof PdfName && sourceRoles instanceof Map && sourceRoles.has(value.value) ? new PdfName(`${prefix}_${value.value}`) : value;
    const className = (value: PdfValue): PdfValue => Array.isArray(value) ? value.map(className) : value instanceof PdfName && sourceClasses instanceof Map && sourceClasses.has(value.value) ? new PdfName(`${prefix}_${value.value}`) : value;
    const originalForm = source.resolve(source.catalog.get('AcroForm'));
    if (originalForm instanceof Map) {
      const dr = source.resolve(originalForm.get('DR'));
      if (dr instanceof Map) for (const category of dr.values()) {
        const entries = source.resolve(category);
        if (entries instanceof Map) for (const key of entries.keys()) resourceNames.set(key, `${prefix}_${key}`);
      }
    }
    const appearance = (value: PdfValue): PdfValue => {
      value = source.resolve(value);
      if (!(value instanceof PdfString)) return copy(value);
      const text = bytesText(value.bytes).replace(/\/([^\x00\t\n\f\r ()<>\[\]{}\/%]+)/g, (token, escaped: string) => {
        const key = escaped.replace(/#([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
        const replacement = resourceNames.get(key);
        return replacement ? serializePdfValue(new PdfName(replacement)) : token;
      });
      return new PdfString(Uint8Array.from(text, (char) => char.charCodeAt(0)));
    };
    function copy(value: PdfValue): PdfValue {
      if (value instanceof PdfReference) {
        const found = refs.get(value.key);
        if (found) return found;
        const ref = reserve(); refs.set(value.key, ref);
        const original = source.resolve(value);
        if (original instanceof PdfStream) put(ref, { data: source.encodedStream(original), dictionary: copyDictionary(original.dictionary) });
        else put(ref, copy(original));
        return ref;
      }
      if (value instanceof PdfStream) {
        const ref = reserve(); put(ref, { data: source.encodedStream(value), dictionary: copyDictionary(value.dictionary) }); return ref;
      }
      if (Array.isArray(value)) return value.map(copy);
      if (value instanceof Map) return copyDictionary(value);
      return value;
    }
    function copyDictionary(original: PdfDictionary): PdfDictionary {
      const type = source.resolve(original.get('Type'));
      const element = type instanceof PdfName && type.value === 'StructElem';
      const subtype = source.resolve(original.get('Subtype'));
      const field = original.has('FT') || original.has('T') || (subtype instanceof PdfName && subtype.value === 'Widget');
      return new Map([...original].map(([key, value]) => [key,
        element && key === 'S' && !original.has('NS') ? roleName(source.resolve(value)) :
          element && key === 'C' ? className(source.resolve(value)) :
        (key === 'StructParents' || key === 'StructParent') ? integer(source.resolve(value)) + parentOffset :
          key === 'DA' && field ? appearance(value) : copy(value)]));
    }
    function outDictionary(value: PdfValue | undefined): PdfDictionary {
      if (value instanceof PdfReference) return dictionary(objects[value.object - 1] as PdfValue);
      return dictionary(value);
    }
    function list(value: PdfValue | undefined): PdfValue[] {
      const resolved = source.resolve(value);
      return Array.isArray(resolved) ? resolved : resolved === null ? [] : [resolved];
    }
    // Reserve page refs before copying cyclic annotations and destinations.
    for (const page of document.pages) refs.set(page.reference.key, reserve());
    for (const page of document.pages) {
      const ref = refs.get(page.reference.key)!;
      const info = copyDictionary(page.dictionary);
      info.set('Parent', pagesRef);
      if (!info.has('Lang') && source.catalog.has('Lang')) info.set('Lang', copy(source.catalog.get('Lang')!));
      put(ref, info); outputPages.push(ref);
    }
    if (originalForm instanceof Map) {
      const container = reserve();
      const children = list(originalForm.get('Fields')).map(copy);
      const root = new Map<string, PdfValue>([['T', new PdfString(bytes(prefix))], ['Kids', children]]);
      for (const key of ['DA', 'Q']) if (originalForm.has(key)) root.set(key, key === 'DA' ? appearance(originalForm.get(key)!) : copy(originalForm.get(key)!));
      for (const child of children) outDictionary(child).set('Parent', container);
      put(container, root); fields.push(container);
      calculations.push(...list(originalForm.get('CO')).map(copy));
      needAppearances ||= source.resolve(originalForm.get('NeedAppearances')) === true;
      const dr = source.resolve(originalForm.get('DR'));
      if (dr instanceof Map) for (const [category, entries] of dr) {
        const resolved = source.resolve(entries);
        if (!(resolved instanceof Map)) unsupported('Unsupported PDF form resource dictionary.');
        const target = (formResources.get(category) as PdfDictionary | undefined) ?? new Map<string, PdfValue>();
        for (const [key, value] of resolved) target.set(resourceNames.get(key)!, copy(value));
        formResources.set(category, target);
      }
    }
    const structValue = source.catalog.get('StructTreeRoot'), struct = source.resolve(structValue);
    if (struct instanceof Map) {
      // Turn each original root into a /Document structure element, retaining child P links.
      const ref = copy(structValue!) as PdfReference, root = outDictionary(ref);
      root.set('Type', new PdfName('StructElem')); root.set('S', new PdfName('Document')); root.set('P', structureRef);
      if (source.catalog.has('Lang')) root.set('Lang', copy(source.catalog.get('Lang')!));
      for (const key of ['ParentTree', 'ParentTreeNextKey', 'RoleMap', 'ClassMap', 'Namespaces', 'IDTree']) root.delete(key);
      structureKids.push(ref);
      const tree = source.resolve(struct.get('ParentTree'));
      let nextOffset = parentOffset;
      if (tree instanceof Map) {
        const nums = source.resolve(tree.get('Nums'));
        if (Array.isArray(nums)) for (let i = 0; i + 1 < nums.length; i += 2) {
          const key = nums[i];
          if (typeof key !== 'number' || !Number.isSafeInteger(key) || key < 0) throw new Error('Invalid structure parent index.');
          parentEntries.push(key + parentOffset, copy(nums[i + 1]!));
          nextOffset = Math.max(nextOffset, key + parentOffset + 1);
        }
      }
      for (const [key, target] of [['RoleMap', roleMap], ['ClassMap', classMap]] as const) {
        const map = source.resolve(struct.get(key));
        if (map instanceof Map) for (const [name, value] of map) {
          target.set(`${prefix}_${name}`, copy(key === 'RoleMap' ? roleName(source.resolve(value)) : value));
        }
      }
      namespaces.push(...list(struct.get('Namespaces')).map(copy));
      const idTree = source.resolve(struct.get('IDTree'));
      if (idTree instanceof Map) {
        const entries = source.resolve(idTree.get('Names'));
        if (Array.isArray(entries)) for (let i = 0; i + 1 < entries.length; i += 2) {
          const id = entries[i];
          if (!(id instanceof PdfString)) throw new Error('Invalid structure identifier.');
          const newId = new PdfString(Uint8Array.from([...bytes(`${prefix}:`), ...id.bytes]));
          const target = copy(entries[i + 1]!); outDictionary(target).set('ID', newId);
          identities.push(newId, target);
        }
      }
      parentOffset = nextOffset;
    }
    const outlines = source.resolve(source.catalog.get('Outlines'));
    if (outlines instanceof Map) {
      let next = outlines.get('First'); const seen = new Set<string>();
      while (next instanceof PdfReference) {
        if (seen.has(next.key)) throw new Error('Cyclic PDF outline list.'); seen.add(next.key);
        const item = copy(next) as PdfReference; outDictionary(item).set('Parent', outlinesRef); outlineItems.push(item);
        next = dictionary(source.resolve(next)).get('Next');
      }
    }
    const oc = source.resolve(source.catalog.get('OCProperties'));
    if (oc instanceof Map) {
      const groups = list(oc.get('OCGs')), d = source.resolve(oc.get('D'));
      if (!(d instanceof Map)) unsupported('PDF optional content needs a default configuration.');
      const intent = source.resolve(d.get('Intent'));
      if (intent !== null && !(intent instanceof PdfName && intent.value === 'View')) unsupported('Merging non-default optional-content configuration intents is not supported.');
      const base = source.resolve(d.get('BaseState'));
      if (base instanceof PdfName && base.value === 'Unchanged') unsupported('Cannot merge optional content with an indeterminate default BaseState.');
      const enabled = new Set(list(d.get('ON')).filter((x) => x instanceof PdfReference).map((x) => x.key));
      const disabled = new Set(list(d.get('OFF')).filter((x) => x instanceof PdfReference).map((x) => x.key));
      for (const group of groups) {
        const visible = group instanceof PdfReference && (enabled.has(group.key) || (!(base instanceof PdfName && base.value === 'OFF') && !disabled.has(group.key)));
        (visible ? on : off).push(copy(group));
      }
      ocgs.push(...groups.map(copy));
      order.push(...list(d.get('Order')).map(copy)); rbGroups.push(...list(d.get('RBGroups')).map(copy));
      locked.push(...list(d.get('Locked')).map(copy)); usages.push(...list(d.get('AS')).map(copy));
      for (const configValue of list(oc.get('Configs'))) {
        const original = dictionary(source.resolve(configValue));
        const config = copyDictionary(original);
        const state = source.resolve(original.get('BaseState'));
        const explicitOn = new Set(list(original.get('ON')).filter((x) => x instanceof PdfReference).map((x) => x.key));
        const explicitOff = new Set(list(original.get('OFF')).filter((x) => x instanceof PdfReference).map((x) => x.key));
        const configOn: PdfValue[] = [], configOff: PdfValue[] = [];
        for (const group of groups) {
          if (!(group instanceof PdfReference)) unsupported('Optional-content groups must be indirect objects.');
          if (explicitOn.has(group.key) || (!(state instanceof PdfName && ['OFF', 'Unchanged'].includes(state.value)) && !explicitOff.has(group.key))) configOn.push(copy(group));
          else if (explicitOff.has(group.key) || !(state instanceof PdfName && state.value === 'Unchanged')) configOff.push(copy(group));
        }
        config.set('BaseState', new PdfName('Unchanged')); config.set('ON', configOn); config.set('OFF', configOff);
        configs.push(config);
      }
    }
    outputIntents.push(...list(source.catalog.get('OutputIntents')).map(copy));
  });
  put(pagesRef, new Map<string, PdfValue>([['Type', new PdfName('Pages')], ['Kids', outputPages], ['Count', outputPages.length]]));
  if (fields.length) catalog.set('AcroForm', new Map<string, PdfValue>([['Fields', fields], ['DR', formResources], ['CO', calculations], ['NeedAppearances', needAppearances]]));
  if (structureKids.length) {
    const root = new Map<string, PdfValue>([['Type', new PdfName('StructTreeRoot')], ['K', structureKids], ['ParentTree', new Map([['Nums', parentEntries]])], ['ParentTreeNextKey', parentOffset]]);
    if (roleMap.size) root.set('RoleMap', roleMap); if (classMap.size) root.set('ClassMap', classMap);
    if (namespaces.length) root.set('Namespaces', namespaces);
    if (identities.length) {
      const pairs: [PdfString, PdfValue][] = [];
      for (let i = 0; i < identities.length; i += 2) pairs.push([identities[i] as PdfString, identities[i + 1]!]);
      pairs.sort(([a], [b]) => { const x = bytesText(a.bytes), y = bytesText(b.bytes); return x < y ? -1 : x > y ? 1 : 0; });
      root.set('IDTree', new Map([['Names', pairs.flat()]]));
    }
    put(structureRef, root); catalog.set('StructTreeRoot', structureRef); catalog.set('MarkInfo', new Map([['Marked', true]]));
  }
  if (outlineItems.length) {
    outlineItems.forEach((ref, i) => {
      const item = dictionary(objects[ref.object - 1] as PdfValue);
      item.delete('Prev'); item.delete('Next');
      if (i) item.set('Prev', outlineItems[i - 1]!);
      if (i + 1 < outlineItems.length) item.set('Next', outlineItems[i + 1]!);
    });
    put(outlinesRef, new Map<string, PdfValue>([['Type', new PdfName('Outlines')], ['First', outlineItems[0]!], ['Last', outlineItems.at(-1)!]]));
    catalog.set('Outlines', outlinesRef);
  }
  if (ocgs.length) catalog.set('OCProperties', new Map<string, PdfValue>([['OCGs', ocgs], ['D', new Map<string, PdfValue>([['BaseState', new PdfName('OFF')], ['ON', on], ['OFF', off], ['Order', order], ['RBGroups', rbGroups], ['Locked', locked], ['AS', usages]])], ['Configs', configs]]));
  if (outputIntents.length) catalog.set('OutputIntents', outputIntents);
  put(catalogRef, catalog);
  const chunks: Uint8Array[] = [bytes(`%PDF-${version}\n%\xE2\xE3\xCF\xD3\n`)], offsets = [0];
  let position = chunks[0]!.length;
  objects.forEach((value, index) => {
    offsets.push(position);
    const head = bytes(`${index + 1} 0 obj\n`), tail = bytes('\nendobj\n');
    let data: Uint8Array;
    if (value !== null && typeof value === 'object' && 'data' in value) {
      const dictionary = new Map(value.dictionary); dictionary.set('Length', value.data.length);
      const start = bytes(serializePdfValue(dictionary) + '\nstream\n'), end = bytes('\nendstream');
      data = new Uint8Array(start.length + value.data.length + end.length);
      data.set(start); data.set(value.data, start.length); data.set(end, start.length + value.data.length);
    } else data = bytes(serializePdfValue(value as PdfValue));
    chunks.push(head, data, tail); position += head.length + data.length + tail.length;
  });
  chunks.push(bytes(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size ${objects.length + 1} /Root ${catalogRef.object} 0 R >>\nstartxref\n${position}\n%%EOF\n`));
  const result = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0)); let at = 0;
  for (const chunk of chunks) { result.set(chunk, at); at += chunk.length; }
  return result;
}
