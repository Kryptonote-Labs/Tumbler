import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import type { WordDocument } from './document.ts';
import type { WordParagraphPositioning } from './positioning.ts';
import type { PackageXml } from './package-xml.ts';

const indentNames = new Set(['left', 'right', 'start', 'end', 'firstLine', 'hanging', 'leftChars', 'rightChars', 'startChars', 'endChars', 'firstLineChars', 'hangingChars']);

/** Reset direct positioning without changing the namespace scope of opaque markup. */
export function resetPositioningMarkup(markup: PackageXml, element: LosslessXmlElement | undefined, name: 'ind' | 'tabs', replacement = ''): string {
  if (!element) return markup.word(replacement);
  const removed = element.attributes.filter(attribute => name === 'ind' && attribute.namespaceUri === element.namespaceUri && indentNames.has(attribute.localName));
  const attributes = element.attributes.filter(attribute => !removed.includes(attribute));
  const children = element.children.filter(child => !(name === 'tabs' && child.kind === 'element' && child.namespaceUri === element.namespaceUri && child.localName === 'tab'));
  if (!replacement && !attributes.some(attribute => attribute.prefix !== 'xmlns' && attribute.qualified !== 'xmlns') && children.every(child => child.kind === 'text' && !child.value.trim())) return '';

  if (name === 'tabs' && !replacement.includes('<w:tab ')) throw new Error(OPAQUE_TABS_RESET_ERROR);

  const closing = `</${element.qualified}>`;
  let opening = markup.wrap(element, name, '').slice(0, -closing.length);
  for (const attribute of removed.toReversed()) {
    const start = attribute.span.start - element.startTagSpan.start;
    opening = opening.slice(0, start) + opening.slice(attribute.span.end - element.startTagSpan.start);
  }
  // A default namespace does not qualify attributes. Allocate a prefix only for new indents.
  let prefix = element.prefix;
  let binding = '';
  if (name === 'ind' && replacement && !prefix) {
    const used = new Set<string>();
    for (let ancestor: LosslessXmlElement | undefined = element; ancestor; ancestor = markup.parents.get(ancestor.id))
      for (const attribute of ancestor.attributes) if (attribute.prefix === 'xmlns') used.add(attribute.localName);
    prefix = 'wordReset';
    while (used.has(prefix)) prefix += '_';
    binding = ` xmlns:${prefix}="${element.namespaceUri}"`;
  }
  const freshAttributes = name === 'ind' ? (replacement.match(/^<w:ind\b([^>]*?)\/>$/)?.[1] ?? '').replaceAll('w:', `${prefix}:`) : '';
  const freshChildren = name === 'tabs' ? replacement.replace(/^<w:tabs>/, '').replace(/<\/w:tabs>$/, '').replaceAll('<w:tab ', `<w:tab xmlns:w="${element.namespaceUri}" `) : '';
  opening = opening.slice(0, -1) + binding + freshAttributes + '>';
  return opening + children.map(child => markup.raw(child)).join('') + freshChildren + closing;
}

export const OPAQUE_TABS_RESET_ERROR = 'Cannot reset source tabs containing opaque XML without replacement tab stops.';

/** Refuse a reset that cannot retain opaque tabs in a schema-valid property container. */
export function assertSourcePositioningReset(document: WordDocument, source: number | undefined, positioning: WordParagraphPositioning | undefined): void {
  if (!positioning?.reset || positioning.tabs?.length || source === undefined) return;
  const paragraph = document.source.element(source);
  const child = (element: LosslessXmlElement | undefined, name: string) => element?.children.find((node): node is LosslessXmlElement => node.kind === 'element' && node.namespaceUri === paragraph?.namespaceUri && node.localName === name);
  const tabs = child(child(paragraph, 'pPr'), 'tabs');
  if (!tabs) return;
  const opaqueAttributes = tabs.attributes.some(attribute => attribute.prefix !== 'xmlns' && attribute.qualified !== 'xmlns');
  const opaqueChildren = tabs.children.some(node => !(node.kind === 'element' && node.namespaceUri === tabs.namespaceUri && node.localName === 'tab') && !(node.kind === 'text' && !node.value.trim()));
  if (opaqueAttributes || opaqueChildren) throw new Error(OPAQUE_TABS_RESET_ERROR);
}
