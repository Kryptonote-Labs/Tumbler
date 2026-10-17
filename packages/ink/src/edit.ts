import { beginLosslessXmlEdit } from '@tumblerjs/ooxml';
import { type OfficeInkDocument, readOfficeInk } from './document.ts';
import { encodeInkTrace, InkError, type InkPoint } from './trace.ts';

/** Replace samples only. The embedding application must update its preview and placement too. */
export function replaceOfficeInkTrace(document: OfficeInkDocument, elementId: number, points: readonly InkPoint[]): OfficeInkDocument {
  const trace = document.traces.find(value => value.elementId === elementId);
  if (!trace) throw new InkError('reference', 'The element is not a decoded trace in this document.');
  const element = document.source.element(elementId)!;
  if (element.children.some(child => child.kind !== 'text' && child.kind !== 'cdata')) throw new InkError('structure', 'Editing a trace containing opaque markup would discard it.');
  const edit = beginLosslessXmlEdit(document.source);
  edit.setText(element, encodeInkTrace(points, trace.channels));
  return readOfficeInk(edit.commit().bytes);
}
