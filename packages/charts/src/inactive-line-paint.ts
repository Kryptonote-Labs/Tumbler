import { normalizeChartNamespaceDeclarations } from './conformance.ts';
import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { chartXmlText, standaloneChartElement } from './source-xml.ts';

const NS = 'urn:tumblerjs:chart-authoring';
const URI = 'https://tumblerjs.org/chart-authoring/inactive-line-paint/v1';
const elements = (node: LosslessXmlElement) => node.children.filter((node): node is LosslessXmlElement => node.kind === 'element');

/** A gallery visibility change retains inactive line paint without freezing live stroke attributes. */
export function chartLineVisibility(markup: string, hidden: boolean): string {
  const source = parseLosslessXml(new TextEncoder().encode(markup)), edit = beginLosslessXmlEdit(source), a = source.root.namespaceUri;
  const fillNames = ['noFill', 'solidFill', 'gradFill', 'pattFill', 'blipFill', 'grpFill'];
  const fills = elements(source.root).filter(node => node.namespaceUri === a && fillNames.includes(node.localName));
  const extension = elements(source.root).find(node => node.namespaceUri === a && node.localName === 'extLst');
  const archived = extension && elements(extension).find(node => node.namespaceUri === a && node.localName === 'ext' && node.attributes.some(attribute => attribute.localName === 'uri' && attribute.value === URI));
  const record = archived && elements(archived).find(node => node.namespaceUri === NS && node.localName === 'paint');
  const active = fills.filter(fill => fill.localName !== 'noFill').map(fill => standaloneChartElement(source, fill)).join('');
  const saved = record && source.textContent(record);
  const restored = saved ? new TextDecoder().decode(normalizeChartNamespaceDeclarations(parseLosslessXml(new TextEncoder().encode(saved)), a.includes('purl.oclc.org') ? 'strict' : 'transitional')) : '';
  const paint = active || restored;
  for (const fill of fills) if (hidden || fill.localName === 'noFill') edit.removeElement(fill);
  if (archived) edit.removeElement(archived);
  const document = parseLosslessXml(edit.commit().bytes), change = beginLosslessXmlEdit(document);
  function append(node: LosslessXmlElement, xml: string, before?: LosslessXmlElement) {
    if (before) change.insertMarkupBefore(before, xml);
    else if (!node.selfClosing) change.appendMarkup(node, xml);
    else change.replaceElementMarkup(node, standaloneChartElement(document, node).replace(/\/>$/, `>${xml}</${node.qualified}>`));
  }
  const fill = hidden ? `<a:noFill xmlns:a="${a}"/>` : active ? '' : paint;
  if (fill) append(document.root, fill, elements(document.root)[0]);
  if (hidden && paint) {
    const archive = `<a:ext xmlns:a="${a}" uri="${URI}"><tb:paint xmlns:tb="${NS}">${chartXmlText(paint)}</tb:paint></a:ext>`;
    const list = elements(document.root).find(node => node.namespaceUri === a && node.localName === 'extLst');
    if (list) append(list, archive); else append(document.root, `<a:extLst xmlns:a="${a}">${archive}</a:extLst>`);
  }
  return new TextDecoder().decode(change.commit().bytes);
}
