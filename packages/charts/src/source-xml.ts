import { parseLosslessXml, type LosslessXmlDocument, type LosslessXmlElement } from '@tumblerjs/ooxml';

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

/** Capture namespace bindings so moved or temporarily inactive properties remain self-contained. */
export function standaloneChartElement(document: LosslessXmlDocument, element: LosslessXmlElement): string {
  const bindings = new Map<string, string>();
  let ancestor: LosslessXmlElement | undefined = document.root;
  while (ancestor) {
    for (const attribute of ancestor.attributes) if (attribute.namespaceUri === 'http://www.w3.org/2000/xmlns/') bindings.set(attribute.qualified, attribute.value);
    if (ancestor.id === element.id) break;
    ancestor = ancestor.children.find((child): child is LosslessXmlElement => child.kind === 'element' && child.span.start <= element.span.start && child.span.end >= element.span.end);
  }
  const own = new Set(element.attributes.filter(attribute => attribute.namespaceUri === 'http://www.w3.org/2000/xmlns/').map(attribute => attribute.qualified));
  const declarations = [...bindings].filter(([name]) => !own.has(name)).map(([name, value]) => ` ${name}="${chartXmlText(value)}"`).join('');
  const source = document.source.slice(element.span.start, element.span.end);
  const offset = element.startTagSpan.end - element.span.start - (element.selfClosing ? 2 : 1);
  return source.slice(0, offset) + declarations + source.slice(offset);
}
