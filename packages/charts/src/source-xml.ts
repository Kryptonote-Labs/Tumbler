import { parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';

export function chartXml(bytes: Uint8Array) {
  const document = parseLosslessXml(bytes);
  const namespace = document.root.namespaceUri;
  if (document.root.localName !== 'chartSpace' || !['http://schemas.openxmlformats.org/drawingml/2006/chart', 'http://purl.oclc.org/ooxml/drawingml/chart'].includes(namespace))
    throw new TypeError('Expected an ECMA-376 chart part.');
  const children = (element: LosslessXmlElement, name?: string) => element.children.filter((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === namespace && (name === undefined || child.localName === name));
  const chart = children(document.root, 'chart')[0];
  if (!chart) throw new TypeError('Chart element is missing.');
  const plotArea = children(chart, 'plotArea')[0];
  if (!plotArea) throw new TypeError('Chart plot area is missing.');
  const markup = (element: LosslessXmlElement) => document.source.slice(element.span.start, element.span.end);
  return { document, namespace, children, chart, plotArea, markup };
}

export function chartXmlText(value: string): string {
  if (!value.isWellFormed() || /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value)) throw new TypeError('Invalid XML text.');
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
