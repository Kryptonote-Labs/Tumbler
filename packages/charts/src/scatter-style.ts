import { chartLineVisibility } from './inactive-line-paint.ts';
import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { standaloneChartElement } from './source-xml.ts';
import type { CreateChartOptions } from './create.ts';

const elements = (node: LosslessXmlElement) => node.children.filter((node): node is LosslessXmlElement => node.kind === 'element');

/** A gallery style sets visibility/smoothing while retaining colours, widths and marker formatting. */
export function applyScatterStyle(xml: string, style: NonNullable<CreateChartOptions['scatterStyle']>): string {
  const document = parseLosslessXml(new TextEncoder().encode(xml)), edit = beginLosslessXmlEdit(document);
  const c = document.root.namespaceUri, a = c.replace(/chart$/, 'main');
  const hidden = style === 'none' || style === 'marker', symbol = ['marker', 'lineMarker', 'smoothMarker'].includes(style) ? 'circle' : 'none';
  const child = (node: LosslessXmlElement, name: string, ns = c) => elements(node).find(child => child.namespaceUri === ns && child.localName === name);
  function append(node: LosslessXmlElement, markup: string, before?: LosslessXmlElement) {
    if (before) edit.insertMarkupBefore(before, markup);
    else if (!node.selfClosing) edit.appendMarkup(node, markup);
    else edit.replaceElementMarkup(node, standaloneChartElement(document, node).replace(/\/>$/, `>${markup}</${node.qualified}>`));
  }
  function value(node: LosslessXmlElement, name: string, next: string, before?: LosslessXmlElement) {
    const existing = child(node, name), markup = `<c:${name} xmlns:c="${c}" val="${next}"/>`;
    if (!existing) append(node, markup, before);
    else {
      const val = existing.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === 'val');
      if (val) edit.setAttribute(val, next); else edit.insertAttribute(existing, 'val', next);
    }
  }
  for (const series of elements(document.root).filter(node => node.namespaceUri === c && node.localName === 'ser')) {
    const shape = child(series, 'spPr'), line = shape && child(shape, 'ln', a);
    if (line) {
      edit.replaceElementMarkup(line, chartLineVisibility(standaloneChartElement(document, line), hidden));
    } else if (hidden) {
      const markup = `<a:ln xmlns:a="${a}"><a:noFill/></a:ln>`;
      if (shape) append(shape, markup, elements(shape).find(node => ['effectLst', 'effectDag', 'scene3d', 'sp3d', 'extLst'].includes(node.localName)));
      else append(series, `<c:spPr xmlns:c="${c}">${markup}</c:spPr>`, elements(series).find(node => !['idx', 'order', 'tx'].includes(node.localName)));
    }
    const marker = child(series, 'marker');
    if (marker) value(marker, 'symbol', symbol, elements(marker)[0]);
    else append(series, `<c:marker xmlns:c="${c}"><c:symbol val="${symbol}"/></c:marker>`, elements(series).find(node => !['idx', 'order', 'tx', 'spPr'].includes(node.localName)));
    value(series, 'smooth', style.startsWith('smooth') ? '1' : '0', child(series, 'extLst'));
  }
  return new TextDecoder().decode(edit.commit().bytes);
}
