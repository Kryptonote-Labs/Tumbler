import type { LosslessXmlElement } from '@tumblerjs/ooxml';
export const INKML_NAMESPACE = 'http://www.w3.org/2003/InkML';
export const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
export const elements = (element: LosslessXmlElement) => element.children.filter((child): child is LosslessXmlElement => child.kind === 'element');
export const children = (element: LosslessXmlElement, name: string) => elements(element).filter(child => child.namespaceUri === INKML_NAMESPACE && child.localName === name);
export const attribute = (element: LosslessXmlElement, name: string, namespace = '') => element.attributes.find(attr => attr.namespaceUri === namespace && attr.localName === name)?.value;
