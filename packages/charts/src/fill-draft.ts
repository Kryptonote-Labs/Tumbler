import { convertChartConformance } from './conformance.ts';
import { chartElementMarkup } from './xml-markup.ts';
import { ensureChartFillNode } from './fill-target.ts';
import { readChartFill } from './pattern-edit.ts';
import { editChartSource } from './source-edit.ts';
import { chartXml, standaloneChartElement } from './source-xml.ts';

export interface ChartFillSnapshot { readonly bytes: Uint8Array; readonly node: number }
function fill(snapshot: ChartFillSnapshot) {
  const inspected = readChartFill(snapshot.bytes, snapshot.node), property = inspected.fill;
  if (!property) return { identity: inspected.ownerIdentity };
  const source = chartXml(snapshot.bytes), element = source.document.element(property.id)!;
  return { identity: inspected.ownerIdentity, source, element, markup: source.markup(element), bindings: chartElementMarkup(element) };
}

/** Rebase a fill draft onto newer chart data/formatting; conflicting edits to the same fill fail. */
export function mergeChartFillDraft(current: ChartFillSnapshot, base: ChartFillSnapshot, draft: ChartFillSnapshot): Uint8Array {
  const conformance = chartXml(current.bytes).namespace.includes('purl.oclc.org') ? 'strict' : 'transitional';
  const before = fill({ ...base, bytes: convertChartConformance(base.bytes, conformance) }), next = fill({ ...draft, bytes: convertChartConformance(draft.bytes, conformance) });
  if (before.markup === next.markup && before.bindings === next.bindings) return current.bytes;
  const latest = fill(current);
  if (latest.identity !== before.identity) throw new Error('The fill target changed. Discard and reload to continue.');
  if (latest.markup !== before.markup || latest.bindings !== before.bindings) throw new Error('This fill changed. Discard and reload to use the latest fill.');
  if (!next.element) return latest.element ? editChartSource(current.bytes, [{ kind: 'remove', node: latest.element.id }]) : current.bytes;
  const markup = standaloneChartElement(next.source.document, next.element);
  if (latest.element) return editChartSource(current.bytes, [{ kind: 'replace', node: latest.element.id, markup }]);
  if (!['gradFill', 'solidFill'].includes(next.element.localName)) throw new TypeError('Only solid and gradient drafts are supported.');
  const prepared = ensureChartFillNode(current.bytes, current.node, next.element.localName === 'gradFill' ? 'gradFill' : 'solidFill');
  return editChartSource(prepared.source, [{ kind: 'replace', node: prepared.fill.id, markup }]);
}
