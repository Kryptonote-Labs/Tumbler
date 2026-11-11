import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import { chartXmlText } from './source-xml.ts';
import { chartNamespaceAttributes } from './xml-namespaces.ts';

/** Materialize a retained DrawingML fragment with its namespace bindings. */
export function chartElementMarkup(node: LosslessXmlElement, drawingNamespace?: string): string {
  const sourceAttributes = chartNamespaceAttributes(node);
  const mapNamespace = (value: string) => drawingNamespace && /^(http:\/\/schemas\.openxmlformats\.org\/drawingml\/2006\/main|http:\/\/purl\.oclc\.org\/ooxml\/drawingml\/main)$/.test(value) ? drawingNamespace : value;
  const namespaces = new Map<string, string>();
  if (node.prefix) namespaces.set(node.prefix, mapNamespace(node.namespaceUri));
  else if (node.namespaceUri) namespaces.set('', mapNamespace(node.namespaceUri));
  for (const attribute of sourceAttributes) if (attribute.prefix && attribute.prefix !== 'xmlns' && attribute.prefix !== 'xml') namespaces.set(attribute.prefix, mapNamespace(attribute.namespaceUri));
  for (const attribute of sourceAttributes) if (attribute.namespaceUri === 'http://www.w3.org/2000/xmlns/') namespaces.delete(attribute.localName === 'xmlns' ? '' : attribute.localName);
  const attributes = sourceAttributes.map(attribute => ` ${attribute.qualified}="${chartXmlText(attribute.namespaceUri === 'http://www.w3.org/2000/xmlns/' ? mapNamespace(attribute.value) : attribute.value)}"`).join('') + [...namespaces].map(([prefix, ns]) => ` xmlns${prefix ? `:${prefix}` : ''}="${chartXmlText(ns)}"`).join('');
  const contents = node.children.map(child => child.kind === 'element' ? chartElementMarkup(child, drawingNamespace) : child.kind === 'text' || child.kind === 'cdata' ? chartXmlText(child.value) : child.kind === 'comment' ? `<!--${child.value}-->` : `<?${child.value}?>`).join('');
  return `<${node.qualified}${attributes}>${contents}</${node.qualified}>`;
}
