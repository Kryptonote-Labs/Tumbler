import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlDocument, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { chartXml, chartXmlText, standaloneChartElement as standalone } from './source-xml.ts';

export const CHART_AUTHORING_NS = 'urn:tumblerjs:chart-authoring';
type ChartXml = ReturnType<typeof chartXml>;
const axisKinds = new Set(['catAx', 'valAx', 'dateAx', 'serAx']);

/** Retain inactive axis formatting in history, with only referenced axes in the native plot. */
export function convertChartAxes({ source, created, original, archived, peers, historyExtension, edit }: {
  source: ChartXml;
  created: ChartXml;
  original: LosslessXmlElement;
  archived: LosslessXmlDocument | undefined;
  peers: readonly LosslessXmlElement[];
  historyExtension: LosslessXmlElement | undefined;
  edit: ReturnType<typeof beginLosslessXmlEdit>;
}) {
  const axes = source.children(source.plotArea).filter(axis => axisKinds.has(axis.localName));
  const generated = created.children(created.plotArea).filter(axis => axisKinds.has(axis.localName));
  const value = (axis: LosslessXmlElement, name: string) => source.children(axis, name)[0]?.attributes.find(attribute => attribute.localName === 'val')?.value;
  const axisId = (axis: LosslessXmlElement) => Number(value(axis, 'axId'));
  const axisIds = (plot: LosslessXmlElement) => source.children(plot, 'axId').map(axis => Number(axis.attributes.find(attribute => attribute.localName === 'val')?.value));
  const native = new Map(axes.map(axis => [axisId(axis), axis]));
  const history = new Map<number, string>();
  if (historyExtension) for (const entry of source.document.elements(CHART_AUTHORING_NS, 'axis')) {
    if (entry.span.start <= historyExtension.span.start || entry.span.end >= historyExtension.span.end) continue;
    const id = Number(entry.attributes.find(attribute => attribute.localName === 'id')?.value);
    if (Number.isInteger(id) && id >= 0) history.set(id, source.document.textContent(entry));
  }
  for (const axis of axes) history.set(axisId(axis), standalone(source.document, axis));
  const currentIds = axisIds(original), savedIds = archived ? axisIds(archived.root) : [];
  const peerIds = new Set(peers.flatMap(axisIds));
  const used = new Set<number>(), occupied = new Set(history.keys());
  const mapping = new Map<number, number>();
  const additions: { xml: string; id: number; cross: number }[] = [];
  const compatible = (axis: LosslessXmlElement, template: LosslessXmlElement) => axis.localName === template.localName || axis.localName === 'dateAx' && template.localName === 'catAx';
  let nextId = 1;
  function allocate() {
    while (occupied.has(nextId)) nextId++;
    occupied.add(nextId);
    return nextId++;
  }
  function saved(id: number | undefined, template: LosslessXmlElement) {
    const xml = id === undefined || used.has(id) || native.has(id) ? undefined : history.get(id);
    if (!xml) return undefined;
    const document = parseLosslessXml(new TextEncoder().encode(xml));
    return compatible(document.root, template) ? xml : undefined;
  }
  for (const [index, template] of generated.entries()) {
    const id = axisId(template), cross = Number(value(template, 'crossAx'));
    const position = value(template, 'axPos');
    const eligible = (axis: LosslessXmlElement | undefined): axis is LosslessXmlElement => !!axis && !used.has(axisId(axis)) && compatible(axis, template);
    const owned = native.get(currentIds[index]!), prior = native.get(savedIds[index]!);
    const archivedAxis = saved(savedIds[index], template);
    const matching = axes.filter(axis => eligible(axis) && value(axis, 'axPos') === position);
    const existing = eligible(owned) ? owned : eligible(prior) ? prior : archivedAxis ? undefined
      : matching.find(axis => !peerIds.has(axisId(axis))) ?? matching[0];
    if (existing) {
      mapping.set(id, axisId(existing));
      used.add(axisId(existing));
      continue;
    }
    let restoredId = savedIds[index], xml = archivedAxis;
    if (!xml) for (const candidate of history.keys()) {
      const candidateXml = saved(candidate, template);
      if (candidateXml && value(parseLosslessXml(new TextEncoder().encode(candidateXml)).root, 'axPos') === position) {
        restoredId = candidate; xml = candidateXml; break;
      }
    }
    const assigned = xml && restoredId !== undefined ? restoredId : allocate();
    used.add(assigned); mapping.set(id, assigned);
    additions.push({ xml: xml ?? standalone(created.document, template), id, cross });
  }
  for (const template of generated) {
    const assigned = mapping.get(axisId(template))!;
    const existing = native.get(assigned);
    // Shared axes retain their peer plot's crossing and formatting.
    if (!existing || peerIds.has(assigned)) continue;
    const reference = source.children(existing, 'crossAx')[0]?.attributes.find(attribute => attribute.localName === 'val');
    const target = mapping.get(Number(value(template, 'crossAx')));
    if (reference && target !== undefined && reference.value !== String(target)) edit.setAttribute(reference, String(target));
  }
  for (const axis of axes) if (!used.has(axisId(axis)) && !peerIds.has(axisId(axis))) edit.removeElement(axis);
  const before = source.children(source.plotArea).find(element => ['dTable', 'spPr', 'extLst'].includes(element.localName));
  for (const addition of additions) {
    const document = parseLosslessXml(new TextEncoder().encode(addition.xml)), axisEdit = beginLosslessXmlEdit(document);
    for (const child of source.children(document.root)) {
      const target = child.localName === 'axId' ? mapping.get(addition.id) : child.localName === 'crossAx' ? mapping.get(addition.cross) : undefined;
      const attribute = child.attributes.find(attribute => attribute.localName === 'val');
      if (target !== undefined && attribute) axisEdit.setAttribute(attribute, String(target));
    }
    const xml = new TextDecoder().decode(axisEdit.commit().bytes);
    if (before) edit.insertMarkupBefore(before, xml); else edit.appendMarkup(source.plotArea, xml);
  }
  function remapPlot(xml: string) {
    const document = parseLosslessXml(new TextEncoder().encode(xml)), plotEdit = beginLosslessXmlEdit(document);
    for (const child of source.children(document.root, 'axId')) {
      const attribute = child.attributes.find(attribute => attribute.localName === 'val');
      const target = attribute && mapping.get(Number(attribute.value));
      if (attribute && target !== undefined) plotEdit.setAttribute(attribute, String(target));
    }
    return new TextDecoder().decode(plotEdit.commit().bytes);
  }
  return { remapPlot, history: [...history].map(([id, xml]) => `<tb:axis id="${id}">${chartXmlText(xml)}</tb:axis>`).join('') };
}
