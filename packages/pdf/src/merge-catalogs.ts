import { PdfName, PdfReference, PdfString, PdfStream, type PdfValue, type PdfDictionary, dictionary, unsupported } from './objects.ts';
import { bytes, serializePdfValue } from './editing/object-writer.ts';
import { PdfSyntax } from './syntax.ts';
import { readContentToken } from './content-syntax.ts';

type Resolve = (value: PdfValue | undefined) => PdfValue | undefined;

/** Join document-level owners for page annotations, layers, outlines and accessibility data. */
export function mergePdfCatalogs(catalogs: PdfDictionary[], objects: PdfValue[], reserve: () => PdfReference, resolve: Resolve): PdfDictionary {
  function same(left: PdfValue, right: PdfValue, seen = new Map<PdfValue, Set<PdfValue>>()): boolean {
    const a = resolve(left), b = resolve(right);
    if (a === b) return true;
    if (a === undefined || b === undefined) return false;
    if (a instanceof PdfName && b instanceof PdfName) return a.value === b.value;
    if (a instanceof PdfString && b instanceof PdfString)
      return a.bytes.length === b.bytes.length && a.bytes.every((byte, index) => byte === b.bytes[index]);
    if (seen.get(a)?.has(b)) return true;
    const matches = seen.get(a) ?? new Set<PdfValue>(); matches.add(b); seen.set(a, matches);
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => same(value, b[index]!, seen));
    if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([key, value]) => b.has(key) && same(value, b.get(key)!, seen));
    return false;
  }
  const output: PdfDictionary = new Map();
  const list = (value: PdfValue | undefined): PdfValue[] => {
    const result = resolve(value); return result === undefined || result === null ? [] : Array.isArray(result) ? result : [result];
  };
  const store = (value: PdfValue) => { const ref = reserve(); objects[ref.object - 1] = value; return ref; };
  const fields: PdfValue[] = [], calculations: PdfValue[] = [], resources: PdfDictionary = new Map();
  const tagKids: PdfValue[] = [], parentNums: PdfValue[] = [], ids: PdfValue[] = [];
  const roles: PdfDictionary = new Map(), classes: PdfDictionary = new Map();
  const tagRoot = reserve();
  let parentOffset = 0;
  const outlines: PdfReference[] = [];
  const outlineRoot = reserve();
  const layers: PdfValue[] = [], on: PdfValue[] = [], off: PdfValue[] = [], order: PdfValue[] = [], locked: PdfValue[] = [], radios: PdfValue[] = [];
  for (const [index, catalog] of catalogs.entries()) {
    const form = resolve(catalog.get('AcroForm'));
    if (form instanceof Map) {
      const renamed = new Map<string, string>();
      const dr = resolve(form.get('DR'));
      if (dr instanceof Map) for (const [category, entries] of dr) {
        if (category === 'ProcSet') {
          const entries = [...list(resources.get(category)), ...list(dr.get(category))];
          resources.set(category, [...new Map(entries.map((entry) => [serializePdfValue(entry), entry])).values()]);
          continue;
        }
        const target = resources.get(category) ?? new Map<string, PdfValue>();
        if (!(target instanceof Map)) unsupported('Invalid PDF form resources.');
        for (const [name, value] of dictionary(resolve(entries))) {
          const unique = `M${index}_${name}`;
          renamed.set(name, unique); target.set(unique, value);
        }
        resources.set(category, target);
      }
      const rewriteDA = (value: PdfValue | undefined): PdfValue | undefined => {
        const original = resolve(value);
        if (!(original instanceof PdfString)) return value;
        const chunks: Uint8Array[] = [];
        const syntax = new PdfSyntax(original.bytes);
        while (syntax.position < original.bytes.length) {
          const at = syntax.position;
          syntax.skip();
          const start = syntax.position;
          if (start === original.bytes.length) { chunks.push(original.bytes.subarray(at)); break; }
          const token = readContentToken(syntax);
          chunks.push(original.bytes.subarray(at, start));
          chunks.push(token instanceof PdfName && renamed.has(token.value)
            ? bytes(serializePdfValue(new PdfName(renamed.get(token.value)!)))
            : original.bytes.subarray(start, syntax.position));
        }
        const result = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
        return new PdfString(result);
      };
      const visit = (value: PdfValue) => {
        const info = dictionary(resolve(value));
        if (info.has('DA')) info.set('DA', rewriteDA(info.get('DA'))!);
        for (const child of list(info.get('Kids'))) visit(child);
      };
      const roots = list(form.get('Fields'));
      for (const field of roots) {
        const info = dictionary(resolve(field));
        visit(field);
        if (!info.has('DA') && form.has('DA')) info.set('DA', rewriteDA(form.get('DA'))!);
        if (!info.has('Q') && form.has('Q')) info.set('Q', form.get('Q')!);
      }
      const wrapper = store(new Map<string, PdfValue>([['T', new PdfString(bytes(`source${index + 1}`))], ['Kids', roots]]));
      for (const field of roots) dictionary(resolve(field)).set('Parent', wrapper);
      if (roots.length) fields.push(wrapper);
      calculations.push(...list(form.get('CO')));
      if (resolve(form.get('NeedAppearances')) === true) output.set('NeedAppearances', true);
    }
    const tags = resolve(catalog.get('StructTreeRoot'));
    if (tags instanceof Map) {
      const children = list(tags.get('K'));
      for (const child of children) dictionary(resolve(child)).set('P', tagRoot);
      tagKids.push(...children);
      const tree = resolve(tags.get('ParentTree'));
      const nums = tree instanceof Map ? list(tree.get('Nums')) : [];
      let next = 0;
      for (let i = 0; i < nums.length; i += 2) {
        const key = nums[i];
        if (typeof key !== 'number') unsupported('Invalid PDF structure parent key.');
        parentNums.push(key + parentOffset, nums[i + 1]!); next = Math.max(next, key + 1);
      }
      // All imported objects belong to this catalog or earlier catalogs. Only its keys need shifting.
      const seen = new Set<PdfValue>();
      const shift = (value: PdfValue | undefined) => {
        value = resolve(value);
        if (value === undefined || seen.has(value)) return;
        seen.add(value);
        if (value instanceof PdfStream) shift(value.dictionary);
        else if (Array.isArray(value)) { for (const item of value) shift(item); }
        else if (value instanceof Map) for (const [key, item] of value) {
          if (['StructParents', 'StructParent'].includes(key) && typeof item === 'number') value.set(key, item + parentOffset);
          else shift(item);
        }
      };
      // Structure elements reference their owning pages and annotations.
      shift(tags);
      parentOffset += next;
      for (const [key, target] of [['RoleMap', roles], ['ClassMap', classes]] as const) {
        const map = resolve(tags.get(key));
        if (map instanceof Map) for (const [name, value] of map) {
          if (target.has(name) && !same(target.get(name)!, value))
            unsupported(`Conflicting PDF accessibility ${key} entry: ${name}.`);
          target.set(name, value);
        }
      }
      const idTree = resolve(tags.get('IDTree'));
      if (idTree instanceof Map) ids.push(...list(idTree.get('Names')));
      if (tags.has('Namespaces')) unsupported('Merging PDF 2.0 accessibility namespaces is not supported.');
    }
    const outline = resolve(catalog.get('Outlines'));
    if (outline instanceof Map && outline.has('First')) {
      const wrapper = store(new Map<string, PdfValue>([['Title', new PdfString(bytes(`Source ${index + 1}`))], ['Parent', outlineRoot], ['First', outline.get('First')!], ['Last', outline.get('Last')!], ['Count', Math.abs(Number(resolve(outline.get('Count')) ?? 0))]]));
      let child = outline.get('First'); const seen = new Set<PdfValue>();
      while (child) {
        if (seen.has(child)) throw new Error('Cyclic PDF outlines.'); seen.add(child);
        const info = dictionary(resolve(child)); info.set('Parent', wrapper); child = info.get('Next');
      }
      outlines.push(wrapper);
    }
    const oc = resolve(catalog.get('OCProperties'));
    if (oc instanceof Map) {
      layers.push(...list(oc.get('OCGs')));
      const defaults = resolve(oc.get('D'));
      if (defaults instanceof Map) {
        const baseState = defaults.get('BaseState');
        if (defaults.has('AS') || baseState !== undefined && !(baseState instanceof PdfName && baseState.value === 'ON'))
          unsupported('Merging automatic or non-default PDF layer configurations is not supported.');
        on.push(...list(defaults.get('ON'))); off.push(...list(defaults.get('OFF')));
        order.push(...list(defaults.get('Order'))); locked.push(...list(defaults.get('Locked'))); radios.push(...list(defaults.get('RBGroups')));
      }
    }
    if (catalog.has('OutputIntents')) output.set('OutputIntents', [...list(output.get('OutputIntents')), ...list(catalog.get('OutputIntents'))]);
    if (!output.has('Lang') && catalog.has('Lang')) output.set('Lang', catalog.get('Lang')!);
  }
  if (fields.length) {
    const form: PdfDictionary = new Map<string, PdfValue>([['Fields', fields], ['DR', resources], ['CO', calculations]]);
    if (output.has('NeedAppearances')) { form.set('NeedAppearances', true); output.delete('NeedAppearances'); }
    output.set('AcroForm', form);
  }
  if (tagKids.length) {
    const idKeys = new Set<string>();
    for (let i = 0; i < ids.length; i += 2) {
      const key = serializePdfValue(ids[i]!);
      if (idKeys.has(key)) unsupported('Merging duplicate PDF structure IDs is not supported.');
      idKeys.add(key);
    }
    const pairs: [PdfValue, PdfValue][] = [];
    for (let i = 0; i < ids.length; i += 2) pairs.push([ids[i]!, ids[i + 1]!]);
    pairs.sort((a, b) => serializePdfValue(a[0]).localeCompare(serializePdfValue(b[0])));
    objects[tagRoot.object - 1] = new Map<string, PdfValue>([['Type', new PdfName('StructTreeRoot')], ['K', tagKids], ['ParentTree', new Map([['Nums', parentNums]])], ['ParentTreeNextKey', parentOffset], ['RoleMap', roles], ['ClassMap', classes], ['IDTree', new Map([['Names', pairs.flat()]])]]);
    output.set('StructTreeRoot', tagRoot); output.set('MarkInfo', new Map([['Marked', true]]));
  }
  if (outlines.length) {
    outlines.forEach((ref, i) => { const info = dictionary(resolve(ref)); if (i) info.set('Prev', outlines[i - 1]!); if (i + 1 < outlines.length) info.set('Next', outlines[i + 1]!); });
    objects[outlineRoot.object - 1] = new Map<string, PdfValue>([['Type', new PdfName('Outlines')], ['First', outlines[0]!], ['Last', outlines.at(-1)!], ['Count', outlines.length]]);
    output.set('Outlines', outlineRoot);
  }
  if (layers.length) output.set('OCProperties', new Map<string, PdfValue>([['OCGs', layers], ['D', new Map<string, PdfValue>([['ON', on], ['OFF', off], ['Order', order], ['Locked', locked], ['RBGroups', radios]])]]));
  return output;
}
