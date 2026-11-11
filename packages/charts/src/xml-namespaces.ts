import type { LosslessXmlAttribute, LosslessXmlElement } from '@tumblerjs/ooxml';

const xmlns = 'http://www.w3.org/2000/xmlns/';
const compatibility = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const inheritedNames = new Set(['Ignorable', 'ProcessContent', 'PreserveElements', 'PreserveAttributes']);
const retainedAttributes = new WeakMap<LosslessXmlElement, readonly LosslessXmlAttribute[]>();
interface Reference { readonly namespace: string; readonly prefix: string; readonly local?: string }
interface Directive { readonly attribute: LosslessXmlAttribute; readonly references: readonly Reference[] }

function references(attribute: LosslessXmlAttribute, scope: ReadonlyMap<string, LosslessXmlAttribute>, prefixList: boolean): Reference[] {
  return attribute.value.trim().split(/\s+/).filter(Boolean).flatMap(token => {
    const separator = token.indexOf(':'), prefix = prefixList ? token : separator < 0 ? '' : token.slice(0, separator);
    const declaration = scope.get(prefix);
    return declaration ? [{ namespace: declaration.value, prefix, ...(prefixList ? {} : { local: separator < 0 ? token : token.slice(separator + 1) }) }] : [];
  });
}

/** Capture effective inherited MC directives and their expanded namespace names before copying fragments. */
export function registerChartNamespaces(root: LosslessXmlElement): void {
  function visit(node: LosslessXmlElement, inherited: ReadonlyMap<string, LosslessXmlAttribute>, parent: ReadonlyMap<string, Directive>) {
    const declarations = node.attributes.filter(attribute => attribute.namespaceUri === xmlns);
    const scope = declarations.length ? new Map([...inherited, ...declarations.map(attribute => [attribute.localName === 'xmlns' ? '' : attribute.localName, attribute] as const)]) : inherited;
    const local = node.attributes.filter(attribute => attribute.namespaceUri === compatibility && inheritedNames.has(attribute.localName));
    let context = parent;
    if (local.length) {
      const current = new Map(parent);
      for (const attribute of local) {
        const previous = current.get(attribute.localName)?.references ?? [];
        const values = [...previous, ...references(attribute, scope, attribute.localName === 'Ignorable')];
        const seen = new Set<string>();
        current.set(attribute.localName, { attribute, references: values.filter(value => {
          const key = JSON.stringify([value.namespace, value.local]);
          if (seen.has(key)) return false;
          seen.add(key); return true;
        }) });
      }
      context = current;
    }
    const external = node.attributes.filter(attribute => attribute.namespaceUri === compatibility && attribute.localName === 'MustUnderstand'
      || node.namespaceUri === compatibility && node.localName === 'Choice' && !attribute.namespaceUri && attribute.localName === 'Requires');
    const drawing = node.namespaceUri === 'http://schemas.openxmlformats.org/drawingml/2006/main' || node.namespaceUri === 'http://purl.oclc.org/ooxml/drawingml/main';
    if (local.length || external.length || drawing && context.size) retainedAttributes.set(node, materialize(node, scope, context, external));
    for (const child of node.children) if (child.kind === 'element') visit(child, scope, context);
  }
  visit(root, new Map(), new Map());
}

function materialize(node: LosslessXmlElement, scope: ReadonlyMap<string, LosslessXmlAttribute>, context: ReadonlyMap<string, Directive>, external: readonly LosslessXmlAttribute[]) {
  const attributes = node.attributes.filter(attribute => attribute.namespaceUri !== compatibility || !inheritedNames.has(attribute.localName));
  const available = new Map([...scope].map(([prefix, attribute]) => [prefix, attribute.value]));
  const own = new Set(attributes.filter(attribute => attribute.namespaceUri === xmlns).map(attribute => attribute.localName === 'xmlns' ? '' : attribute.localName));
  const prefixFor = (namespace: string, preferred: string, template: LosslessXmlAttribute) => {
    let prefix = preferred && available.get(preferred) === namespace ? preferred : [...available].find(([prefix, value]) => prefix && value === namespace)?.[0];
    if (!prefix) { let index = 1; do { prefix = `chartNs${index++}`; } while (available.has(prefix)); }
    available.set(prefix, namespace);
    if (!own.has(prefix)) {
      attributes.push({ ...template, prefix: 'xmlns', qualified: `xmlns:${prefix}`, localName: prefix, namespaceUri: xmlns, value: namespace });
      own.add(prefix);
    }
    return prefix;
  };
  for (const { attribute, references } of context.values()) {
    const prefix = prefixFor(compatibility, attribute.prefix, attribute);
    const value = references.map(reference => {
      const prefix = prefixFor(reference.namespace, reference.prefix, attribute);
      return reference.local === undefined ? prefix : `${prefix}:${reference.local}`;
    }).join(' ');
    attributes.push({ ...attribute, prefix, qualified: `${prefix}:${attribute.localName}`, value });
  }
  for (const attribute of external) for (const reference of references(attribute, scope, true)) prefixFor(reference.namespace, reference.prefix, attribute);
  return attributes;
}

export function chartNamespaceAttributes(node: LosslessXmlElement): readonly LosslessXmlAttribute[] {
  return retainedAttributes.get(node) ?? node.attributes;
}

/** Store self-contained metadata so native serialization does not depend on a process-local lookup. */
export function retainedChartElement(node: LosslessXmlElement): LosslessXmlElement {
  const attributes = chartNamespaceAttributes(node);
  const children = node.children.map(child => child.kind === 'element' ? retainedChartElement(child) : child);
  return attributes === node.attributes && children.every((child, index) => child === node.children[index]) ? node : { ...node, attributes, children };
}
