import { parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';
import type { WordDocument } from './document.ts';

// Insertions are projected into editable leaves. Deletions and moves remain opaque.
const containers = new Set(['ins']);
const modeled = new Set(['body', 'hdr', 'ftr', 'p', 'tbl', 'tr', 'tc', 'r', 'hyperlink', ...containers]);
const decimal = (value: string) => /^[+-]?\d+$/.test(value) ? BigInt(value).toString() : value;

/** A source revision can own several text leaves and zero-width markers. Rejoin its
 * adjacent fragments, then give genuinely split revisions distinct Word identities.
 */
export function reconcileRevisionContainers(value: string, original: WordDocument) {
  const namespace = original.source.root.namespaceUri;
  if (!original.source.elements().some(element => element.namespaceUri === namespace && containers.has(element.localName))) return value;
  const source = parseLosslessXml(new TextEncoder().encode(value));
  const rendered: LosslessXmlElement[] = [];
  const visit = (element: LosslessXmlElement) => {
    if (element.namespaceUri !== namespace || !modeled.has(element.localName)) return;
    rendered.push(element);
    for (const child of element.children) if (child.kind === 'element') visit(child);
  };
  visit(source.root);
  const raw = (element: LosslessXmlElement) => value.slice(element.startTagSpan.start, element.startTagSpan.end);
  const revision = (element: LosslessXmlElement) => element.namespaceUri === namespace && containers.has(element.localName)
    ? element.attributes.find(attribute => attribute.namespaceUri === namespace && attribute.localName === 'id') : undefined;
  const edits: { start: number; end: number; text: string }[] = [];
  const joined = new Set<number>();
  for (const parent of rendered) {
    let previous: LosslessXmlElement | undefined;
    for (const child of parent.children) {
      if (child.kind !== 'element') { previous = undefined; continue; }
      if (previous && revision(previous) && revision(child) && !child.selfClosing && previous.endTagSpan &&
          previous.span.end === child.span.start && raw(previous) === raw(child)) {
        edits.push({ start: previous.endTagSpan.start, end: child.startTagSpan.end, text: '' });
        joined.add(child.id);
      }
      previous = child;
    }
  }
  const reserved = new Set(source.elements().flatMap(element => element.attributes
    .filter(attribute => attribute.namespaceUri === namespace && attribute.localName === 'id').map(attribute => decimal(attribute.value))));
  const emitted = new Set<string>();
  let next = 0;
  for (const element of rendered) {
    const id = revision(element);
    if (!id || joined.has(element.id)) continue;
    const key = `${element.localName}:${decimal(id.value)}`;
    if (!emitted.has(key)) { emitted.add(key); continue; }
    while (reserved.has(String(next))) next++;
    const fresh = String(next++);
    reserved.add(fresh);
    edits.push({ start: id.valueSpan.start, end: id.valueSpan.end, text: fresh });
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) value = value.slice(0, edit.start) + edit.text + value.slice(edit.end);
  return value;
}
