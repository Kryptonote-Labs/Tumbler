import { children, elements } from './xml.ts';
import { beginLosslessXmlEdit } from '@tumblerjs/ooxml';
import { type OfficeInkDocument, readOfficeInk } from './document.ts';
import { encodeInkTrace, InkError, type InkPoint } from './trace.ts';

/** Replace samples and invalidate recognition caches for affected groups. The host updates its preview too. */
export function replaceOfficeInkTrace(document: OfficeInkDocument, elementId: number, points: readonly InkPoint[]): OfficeInkDocument {
  const trace = document.traces.find(value => value.elementId === elementId);
  if (!trace) throw new InkError('reference', 'The element is not a decoded trace in this document.');
  if (trace.points.length === points.length && trace.points.every((point, index) => point.length === points[index]!.length && point.every((sample, channel) => sample === points[index]![channel]))) return document;
  const element = document.source.element(elementId)!;
  if (element.children.some(child => child.kind !== 'text' && child.kind !== 'cdata')) throw new InkError('structure', 'Editing a trace containing opaque markup would discard it.');
  const edit = beginLosslessXmlEdit(document.source);
  edit.setText(element, encodeInkTrace(points, trace.channels));
  for (const group of document.source.elements()) {
    if (group.localName !== 'traceGroup' || group.namespaceUri !== document.source.root.namespaceUri || group.span.start > element.span.start || group.span.end < element.span.end) continue;
    for (const annotation of children(group, 'annotationXML')) {
      const emma = elements(annotation).filter(child => child.namespaceUri === 'http://www.w3.org/2003/04/emma' && child.localName === 'emma');
      if (!emma.length) continue;
      if (elements(annotation).length === emma.length) edit.replaceElementMarkup(annotation, '');
      else for (const cache of emma) edit.replaceElementMarkup(cache, '');
    }
  }
  return readOfficeInk(edit.commit().bytes);
}
