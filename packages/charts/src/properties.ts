import schemaData from './property-schema.json' with { type: 'json' };
import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { inspectChartSource, type ChartSourceNode } from './source-edit.ts';
import { chartXmlText } from './source-xml.ts';

export interface ChartPropertyAttribute {
  readonly name: string;
  readonly label: string;
  readonly kind: string;
  readonly required: boolean;
  readonly choices?: readonly { readonly value: string; readonly label: string }[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minimumExclusive?: number;
  readonly maximumExclusive?: number;
  readonly integer?: boolean;
}
interface Particle {
  readonly Name?: string;
  readonly Kind?: string;
  readonly Occurs?: readonly { readonly Min?: number; readonly Max?: number }[];
  readonly Items?: readonly Particle[];
}
export interface ChartPropertyDefinition {
  readonly name: string;
  readonly label: string;
  readonly text: boolean;
  readonly attributes: readonly ChartPropertyAttribute[];
  readonly children: readonly string[];
  readonly particle?: Particle;
}
const schema: { readonly namespaces: Readonly<Record<string, string>>; readonly types: Readonly<Record<string, ChartPropertyDefinition>> } = schemaData;
export interface ChartPropertyNode extends Omit<ChartSourceNode, 'attributes' | 'children'> {
  readonly definition?: string;
  readonly label: string;
  readonly editableText: boolean;
  readonly attributes: readonly (ChartPropertyAttribute & { readonly value: string | undefined })[];
  readonly children: readonly ChartPropertyNode[];
  readonly availableChildren: readonly { readonly definition: string; readonly label: string }[];
}
function normalized(namespace: string): string {
  return namespace.replace('http://purl.oclc.org/ooxml/drawingml/', 'http://schemas.openxmlformats.org/drawingml/2006/');
}
function matches(qualified: string, source: ChartSourceNode): boolean {
  const [prefix, local] = qualified.split(':');
  return source.name.split(':').at(-1) === local && normalized(source.namespace) === schema.namespaces[prefix!];
}
function humanize(name: string): string { return name.split(':').at(-1)!.replace(/([a-z\d])([A-Z])/g, '$1 $2'); }
function maximum(particle: Particle | undefined, name: string, parent = 1): number {
  if (!particle) return 1;
  const repeat = parent * (particle.Occurs ? particle.Occurs[0]?.Max ?? Infinity : 1);
  if (particle.Name) return particle.Name === name ? repeat : 0;
  return Math.max(0, ...(particle.Items ?? []).map(child => maximum(child, name, repeat)));
}

/** A schema-backed tree gives all known chart and DrawingML properties named controls.
 * Unknown extension properties remain inspectable and editable instead of being discarded.
 */
export function chartPropertyTree(bytes: Uint8Array): ChartPropertyNode {
  const root = inspectChartSource(bytes);
  function visit(node: ChartSourceNode, candidates: readonly string[]): ChartPropertyNode {
    const name = candidates.find(name => schema.types[name] && matches(schema.types[name]!.name, node));
    const definition = name ? schema.types[name] : undefined;
    const attributes = definition?.attributes ?? [];
    const known = new Set(attributes.map(attribute => attribute.name));
    const unknown = node.attributes.filter(attribute => !known.has(attribute.name) && attribute.namespace !== 'http://www.w3.org/2000/xmlns/').map(attribute => ({ name: attribute.name, label: humanize(attribute.name), kind: 'string', required: false }));
    const childTypes = definition?.children ?? [];
    return {
      ...node, ...(name ? { definition: name } : {}), label: definition?.label ?? humanize(node.name), editableText: definition?.text ?? !node.children.length,
      attributes: [...attributes, ...unknown].map(attribute => ({ ...attribute, value: node.attributes.find(source => source.name === attribute.name)?.value })),
      children: node.children.map(child => visit(child, childTypes.length ? childTypes : Object.keys(schema.types))),
      availableChildren: childTypes.flatMap(name => {
        const child = schema.types[name];
        if (!child || node.children.filter(node => matches(child.name, node)).length >= maximum(definition?.particle, name)) return [];
        return [{ definition: name, label: child.label }];
      }),
    };
  }
  return visit(root, Object.keys(schema.types));
}

export function chartPropertyDefinition(name: string): ChartPropertyDefinition | undefined { return schema.types[name]; }

/** Build the smallest declared property subtree, supplying required attributes and children. */
function propertyMarkup(name: string, strict: boolean, active = new Set<string>()): string {
  const definition = schema.types[name];
  if (!definition) throw new TypeError(`Unknown chart property ${name}.`);
  if (active.has(name)) throw new TypeError('Recursive property requires an explicit selection.');
  const next = new Set(active).add(name);
  const qualified = definition.name;
  const prefix = qualified.split(':')[0]!;
  const namespace = schema.namespaces[prefix];
  if (namespace === undefined) throw new TypeError(`Unknown chart property namespace ${prefix}.`);
  const ns = strict ? namespace.replace('http://schemas.openxmlformats.org/drawingml/2006/', 'http://purl.oclc.org/ooxml/drawingml/') : namespace;
  const attributes = definition.attributes.filter(attribute => attribute.required).map(attribute => {
    const choice = attribute.choices?.find(choice => ['accent1', 'linear', 'minMax', 'auto'].includes(choice.value)) ?? attribute.choices?.[0];
    let number = Math.max(0, attribute.minimum ?? 0);
    if (attribute.minimumExclusive !== undefined && number <= attribute.minimumExclusive) number = attribute.minimumExclusive + 1;
    if (attribute.maximum !== undefined) number = Math.min(number, attribute.maximum);
    if (attribute.maximumExclusive !== undefined && number >= attribute.maximumExclusive) number = attribute.maximumExclusive - 1;
    const value = choice?.value ?? (attribute.kind === 'boolean' ? '1' : attribute.kind === 'number' ? String(number) : attribute.kind === 'hex' ? '000000' : '');
    const attributePrefix = attribute.name.includes(':') ? attribute.name.split(':')[0] : undefined;
    const declaration = attributePrefix && attributePrefix !== prefix ? ` xmlns:${attributePrefix}="${schema.namespaces[attributePrefix]}"` : '';
    return `${declaration} ${attribute.name}="${chartXmlText(value)}"`;
  }).join('');
  function particleMarkup(particle: Particle): string {
    const minimum = particle.Occurs ? particle.Occurs[0]?.Min ?? 0 : 1;
    if (!minimum) return '';
    const content = particle.Name ? propertyMarkup(particle.Name, strict, next)
      : particle.Kind === 'Choice' ? (particle.Items?.find(item => item.Name && schema.types[item.Name]) ? particleMarkup(particle.Items.find(item => item.Name && schema.types[item.Name])!) : particle.Items?.[0] ? particleMarkup(particle.Items[0]) : '')
      : (particle.Items ?? []).map(particleMarkup).join('');
    return content.repeat(minimum);
  }
  const content = definition.particle ? particleMarkup(definition.particle) : '';
  return `<${qualified} xmlns:${prefix}="${ns}"${attributes}>${content}</${qualified}>`;
}

/** Add a property in schema sequence order. Choice peers are replaced atomically. */
export function insertChartProperty(bytes: Uint8Array, node: number, name: string): Uint8Array {
  const tree = chartPropertyTree(bytes);
  const pending = [tree];
  let target: ChartPropertyNode | undefined;
  while (pending.length) { const current = pending.pop()!; if (current.id === node) { target = current; break; } pending.push(...current.children); }
  if (!target?.definition || !target.availableChildren.some(child => child.definition === name)) throw new TypeError('This property cannot be added at this location.');
  const definition = schema.types[target.definition]!;
  const document = parseLosslessXml(bytes);
  const element = document.element(node)!;
  const edit = beginLosslessXmlEdit(document);
  const markup = propertyMarkup(name, document.root.namespaceUri.includes('purl.oclc.org'));
  const peers = new Set<string>();
  function choices(particle: Particle) {
    const names = (item: Particle): string[] => item.Name ? [item.Name] : (item.Items ?? []).flatMap(names);
    if (particle.Kind === 'Choice' && names(particle).includes(name) && (particle.Occurs === undefined || particle.Occurs[0]?.Max === 1)) for (const peer of names(particle)) if (peer !== name) peers.add(peer);
    for (const child of particle.Items ?? []) choices(child);
  }
  if (definition.particle) choices(definition.particle);
  const existing = target.children.filter(child => child.definition && peers.has(child.definition));
  for (const child of existing) edit.removeElement(document.element(child.id)!);
  const index = definition.children.indexOf(name);
  const following = target.children.find(child => !existing.includes(child) && child.definition && definition.children.indexOf(child.definition) > index);
  if (following) edit.insertMarkupBefore(document.element(following.id)!, markup);
  else if (element.selfClosing) {
    const start = document.source.slice(element.startTagSpan.start, element.startTagSpan.end).replace(/\/\s*>$/, '>');
    edit.replaceElementMarkup(element, `${start}${markup}</${element.qualified}>`);
  } else edit.appendMarkup(element, markup);
  return edit.commit().bytes;
}
