import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';

const chartNamespaces = new Set([
  'http://schemas.openxmlformats.org/drawingml/2006/chart',
  'http://purl.oclc.org/ooxml/drawingml/chart',
  'http://schemas.microsoft.com/office/drawing/2014/chartex',
]);

export interface ChartSourceNode {
  /** Address within this snapshot only. Hosts must reject edits to stale snapshots. */
  readonly id: number;
  readonly name: string;
  readonly namespace: string;
  readonly attributes: readonly { readonly name: string; readonly namespace: string; readonly value: string }[];
  /** Direct text, excluding descendant elements. */
  readonly text: string;
  readonly children: readonly ChartSourceNode[];
}

/** Low-level edits also cover extension properties not understood by the renderer.
 * All addresses refer to the original snapshot. Overlapping edits are rejected.
 * Markup must use namespaces declared in scope or declare its own namespaces.
 */
export type ChartSourceEdit =
  | { readonly kind: 'attribute'; readonly node: number; readonly name: string; readonly value: string | null }
  | { readonly kind: 'text'; readonly node: number; readonly value: string }
  | { readonly kind: 'replace'; readonly node: number; readonly markup: string }
  | { readonly kind: 'remove'; readonly node: number }
  | { readonly kind: 'append'; readonly node: number; readonly markup: string }
  | { readonly kind: 'before'; readonly node: number; readonly markup: string };

function openChartSource(bytes: Uint8Array) {
  const document = parseLosslessXml(bytes);
  if (document.root.localName !== 'chartSpace' || !chartNamespaces.has(document.root.namespaceUri))
    throw new TypeError('Expected a DrawingML chartSpace part.');
  return document;
}

/** Inspect every source property, retaining qualified names and extension namespaces. */
export function inspectChartSource(bytes: Uint8Array): ChartSourceNode {
  const document = openChartSource(bytes);
  const visit = (element: LosslessXmlElement): ChartSourceNode => ({
    id: element.id,
    name: element.qualified,
    namespace: element.namespaceUri,
    attributes: element.attributes.map(attribute => ({ name: attribute.qualified, namespace: attribute.namespaceUri, value: attribute.value })),
    text: element.children.flatMap(child => child.kind === 'text' || child.kind === 'cdata' ? [child.value] : []).join(''),
    children: element.children.filter((child): child is LosslessXmlElement => child.kind === 'element').map(visit),
  });
  return visit(document.root);
}

/** Apply an atomic lexical edit without rebuilding chart XML from a lossy render model.
 * This validates XML well-formedness, not chart schema or cross-part relationships.
 * Referenced workbook changes must be included in the owning package transaction.
 */
export function editChartSource(bytes: Uint8Array, edits: readonly ChartSourceEdit[]): Uint8Array {
  const document = openChartSource(bytes);
  const editor = beginLosslessXmlEdit(document);
  const touchedAttributes = new Set<string>();
  for (const edit of edits) {
    const element = document.element(edit.node);
    if (!element) throw new RangeError(`Chart node ${edit.node} is missing. Inspect the current source first.`);
    switch (edit.kind) {
      case 'attribute': {
        const key = `${element.id}:${edit.name}`;
        if (touchedAttributes.has(key)) throw new TypeError(`Duplicate edit to ${edit.name}.`);
        touchedAttributes.add(key);
        if (!/^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?$/.test(edit.name))
          throw new TypeError('Invalid XML attribute name.');
        const attribute = element.attributes.find(attribute => attribute.qualified === edit.name);
        if (edit.value === null) { if (attribute) editor.removeAttribute(attribute); }
        else if (attribute) editor.setAttribute(attribute, edit.value);
        else editor.insertAttribute(element, edit.name, edit.value);
        break;
      }
      case 'text':
        if (element.children.some(child => child.kind === 'element'))
          throw new TypeError('Text edits require a leaf element; use replace for structured content.');
        editor.setText(element, edit.value);
        break;
      case 'replace': editor.replaceElementMarkup(element, edit.markup); break;
      case 'remove': editor.removeElement(element); break;
      case 'before': editor.insertMarkupBefore(element, edit.markup); break;
      case 'append':
        if (element.selfClosing) {
          const start = document.source.slice(element.startTagSpan.start, element.startTagSpan.end).replace(/\/\s*>$/, '>');
          editor.replaceElementMarkup(element, `${start}${edit.markup}</${element.qualified}>`);
        } else editor.appendMarkup(element, edit.markup);
        break;
    }
  }
  const result = editor.commit().bytes;
  openChartSource(result);
  return result;
}
