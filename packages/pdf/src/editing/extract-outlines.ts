import { PdfName, PdfReference, type PdfValue, type PdfDictionary } from '../objects.ts';
import type { PdfExtractionContext } from './extract-structures.ts';

/** Keep selected-page bookmarks and their surviving ancestors, rebuilding sibling and parent links. */
export function subsetPdfOutlines(
  context: PdfExtractionContext,
  destination: (value: PdfValue) => PdfValue | undefined,
): PdfReference | undefined {
  const { source, reserve, set, copy, copyAction } = context,
    original = source.resolve(source.catalog.get('Outlines'));
  if (!(original instanceof Map)) return undefined;
  const root = reserve(),
    seen = new Set<string>();
  function siblings(first: PdfValue | undefined, parent: PdfReference) {
    const kept: { ref: PdfReference; info: PdfDictionary; descendants: number }[] = [];
    let current = first;
    while (current instanceof PdfReference) {
      if (seen.has(current.key)) throw new Error('Cyclic PDF bookmark tree.');
      seen.add(current.key);
      const original = source.resolve(current);
      if (!(original instanceof Map)) break;
      const ref = reserve(),
        children = siblings(original.get('First'), ref),
        info = new Map<string, PdfValue>();
      const explicit = original.get('Dest'),
        dest = explicit === undefined ? undefined : destination(explicit);
      const action = copyAction(original.get('A'));
      if (dest || action || children.items.length) {
        for (const [key, value] of original)
          if (!['Parent', 'First', 'Last', 'Next', 'Prev', 'Count', 'Dest', 'A'].includes(key))
            info.set(key, copy(value));
        info.set('Parent', parent);
        if (dest) info.set('Dest', dest);
        if (action) info.set('A', action);
        if (children.items.length) {
          info.set('First', children.items[0]!.ref);
          info.set('Last', children.items.at(-1)!.ref);
          info.set('Count', (Number(original.get('Count')) < 0 ? -1 : 1) * children.total);
        }
        kept.push({ ref, info, descendants: children.total });
      } else set(ref, null);
      current = original.get('Next');
    }
    kept.forEach((item, index) => {
      if (index) item.info.set('Prev', kept[index - 1]!.ref);
      if (index + 1 < kept.length) item.info.set('Next', kept[index + 1]!.ref);
      set(item.ref, item.info);
    });
    return { items: kept, total: kept.reduce((sum, item) => sum + 1 + item.descendants, 0) };
  }
  const children = siblings(original.get('First'), root);
  if (!children.items.length) {
    set(root, null);
    return undefined;
  }
  set(
    root,
    new Map<string, PdfValue>([
      ['Type', new PdfName('Outlines')],
      ['First', children.items[0]!.ref],
      ['Last', children.items.at(-1)!.ref],
      ['Count', children.total],
    ]),
  );
  return root;
}
