import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';
import type { ChartColor } from './model.ts';
import { chartElementMarkup } from './xml-markup.ts';
import { chartXmlText } from './source-xml.ts';

export function chartColorMarkup(color: ChartColor, drawing: string): string {
  const original = color.source?.children.find((child): child is LosslessXmlElement => child.kind === 'element' && ['http://schemas.openxmlformats.org/drawingml/2006/main', 'http://purl.oclc.org/ooxml/drawingml/main'].includes(child.namespaceUri) && ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'].includes(child.localName));
  if (original) return chartElementMarkup(original, drawing);
  const kind = color.kind === 'rgb' ? 'srgbClr' : 'schemeClr';
  return `<a:${kind} xmlns:a="${drawing}" val="${chartXmlText(color.value.replace(/^#/, ''))}">${color.transforms?.map(transform => `<a:${transform.kind} val="${Math.round(transform.value * 100000)}"/>`).join('') ?? ''}</a:${kind}>`;
}


/** Opacity changes keep theme references and every non-alpha colour transform. */
export function chartColorOpacityMarkup(color: ChartColor, drawing: string, opacity?: number) {
  const markup = chartColorMarkup(color, drawing);
  if (opacity === undefined) return markup;
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new RangeError('Opacity must be between 0 and 1.');
  const document = parseLosslessXml(new TextEncoder().encode(markup)), root = document.root;
  const alpha = `<a:alpha xmlns:a="${drawing}" val="${Math.round(opacity * 100000)}"/>`;
  if (root.selfClosing) return document.source.slice(root.startTagSpan.start, root.startTagSpan.end).replace(/\/\s*>$/, '>') + alpha + `</${root.qualified}>`;
  const edit = beginLosslessXmlEdit(document);
  for (const child of root.children) if (child.kind === 'element' && child.namespaceUri === drawing && ['alpha', 'alphaMod', 'alphaOff'].includes(child.localName)) edit.removeElement(child);
  edit.appendMarkup(root, alpha);
  return new TextDecoder().decode(edit.commit().bytes);
}

export function chartColorOpacity(color: ChartColor) {
  const source = color.source?.children.find((node): node is LosslessXmlElement => node.kind === 'element' && ['http://schemas.openxmlformats.org/drawingml/2006/main', 'http://purl.oclc.org/ooxml/drawingml/main'].includes(node.namespaceUri) && ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'].includes(node.localName));
  let opacity = 1;
  for (const node of source?.children ?? []) {
    if (node.kind !== 'element' || node.namespaceUri !== source?.namespaceUri || !['alpha', 'alphaMod', 'alphaOff'].includes(node.localName)) continue;
    const raw = node.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === 'val')?.value;
    const value = raw?.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw) / 100000;
    if (Number.isFinite(value)) opacity = Math.max(0, Math.min(1, node.localName === 'alpha' ? value : node.localName === 'alphaMod' ? opacity * value : opacity + value));
  }
  return Math.max(0, Math.min(1, opacity));
}
