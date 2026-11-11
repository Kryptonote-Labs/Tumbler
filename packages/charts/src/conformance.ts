import { beginLosslessXmlEdit, OOXML_NAMESPACES } from '@tumblerjs/ooxml';
import { chartXml } from './source-xml.ts';

/** Reconcile standard namespace declarations with the owning package without changing formula/text literals or extensions. */
export function convertChartConformance(bytes: Uint8Array, conformance: 'strict' | 'transitional'): Uint8Array {
  const { document, namespace } = chartXml(bytes);
  const target = OOXML_NAMESPACES[conformance];
  if (namespace === target.chart) return bytes;
  const other = OOXML_NAMESPACES[conformance === 'strict' ? 'transitional' : 'strict'];
  const relationships = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const previousRelationships = conformance === 'strict' ? 'http://schemas.openxmlformats.org/officeDocument/2006/relationships' : 'http://purl.oclc.org/ooxml/officeDocument/relationships';
  const namespaces = new Map([[other.chart, target.chart], [other.drawing, target.drawing], [previousRelationships, relationships]]);
  const edit = beginLosslessXmlEdit(document);
  for (const element of document.elements()) for (const attribute of element.attributes) {
    if (attribute.namespaceUri !== 'http://www.w3.org/2000/xmlns/') continue;
    const value = namespaces.get(attribute.value);
    if (value) edit.setAttribute(attribute, value);
  }
  return edit.commit().bytes;
}
