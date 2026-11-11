import { createRelationship, PartName, Relationships, RelationshipsError, type OpcPackage, type PackageTransaction } from '@tumblerjs/opc';
import { parseLosslessXml } from '@tumblerjs/ooxml';
import { chartBase64ToBytes, chartBytesToBase64 } from './base64.ts';
import { normalizeChartNamespaceDeclarations } from './conformance.ts';

export interface ChartResourceRelationship {
  readonly id: string;
  readonly type: string;
  /** An internal resource key, '$chart' for the owning chart, or an external URI. */
  readonly target: string;
  readonly targetMode?: 'Internal' | 'External' | undefined;
  readonly fragment?: string | undefined;
}
export interface ChartResourcePart {
  readonly key: string;
  readonly contentType: string;
  /** Base64 of the original part bytes. Embedded packages keep their own conformance profile. */
  readonly data: string;
  readonly relationships?: readonly ChartResourceRelationship[] | undefined;
}
/** A complete snapshot of chart-related parts, excluding its separately editable source workbook. */
export interface ChartResources {
  readonly parts: readonly ChartResourcePart[];
  readonly relationships: readonly ChartResourceRelationship[];
}

export function chartPartRelationships(pkg: OpcPackage, name: PartName): Relationships {
  try { return pkg.relationships(name); }
  catch (cause) {
    if (!(cause instanceof RelationshipsError) || cause.code !== 'missing_item') throw cause;
    return new Relationships(name, []);
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid chart resource object.');
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.length) throw new TypeError('Chart resource fields require nonempty strings.');
  return value;
}
function relationships(value: unknown): readonly ChartResourceRelationship[] {
  if (!Array.isArray(value)) throw new TypeError('Chart resource relationships must be an array.');
  const ids = new Set<string>();
  return value.map(entry => {
    const input = object(entry), id = string(input.id), type = string(input.type), target = string(input.target);
    if (ids.has(id)) throw new TypeError(`Duplicate chart resource relationship ${id}.`);
    ids.add(id);
    if (input.targetMode !== undefined && input.targetMode !== 'Internal' && input.targetMode !== 'External') throw new TypeError('Invalid chart resource target mode.');
    const external = input.targetMode === 'External';
    if (input.fragment !== undefined && typeof input.fragment !== 'string') throw new TypeError('Invalid chart resource fragment.');
    const fragment = input.fragment as string | undefined;
    if (external && fragment !== undefined) throw new TypeError('External relationship fragments belong in the target URI.');
    createRelationship(null, external ? { id, type, target, targetMode: 'External' } : { id, type, target: PartName.parse('/resource.bin'), ...(fragment === undefined ? {} : { fragment }) });
    return { id, type, target, ...(external ? { targetMode: 'External' as const } : {}), ...(fragment === undefined ? {} : { fragment }) };
  });
}

/** Validate the graph without loading external relationships or imposing authoring size limits. */
export function parseChartResources(value: unknown): ChartResources {
  const input = object(value);
  if (!Array.isArray(input.parts)) throw new TypeError('Chart resource parts must be an array.');
  const keys = new Set<string>();
  const parts = input.parts.map(entry => {
    const part = object(entry), key = string(part.key), contentType = string(part.contentType);
    if (key === '$chart' || keys.has(key)) throw new TypeError(`Duplicate or reserved chart resource key ${key}.`);
    keys.add(key);
    if (typeof part.data !== 'string') throw new TypeError('Chart resource data must be base64.');
    chartBase64ToBytes(part.data);
    return { key, contentType, data: part.data, ...(part.relationships === undefined ? {} : { relationships: relationships(part.relationships) }) };
  });
  const root = relationships(input.relationships);
  for (const relationship of [...root, ...parts.flatMap(part => part.relationships ?? [])]) {
    if (relationship.targetMode !== 'External' && relationship.target !== '$chart' && !keys.has(relationship.target)) throw new TypeError(`Chart resource ${relationship.target} is missing.`);
  }
  return { parts, relationships: root };
}
export function isChartResources(value: unknown): value is ChartResources {
  try { parseChartResources(value); return true; } catch { return false; }
}

/** Read the complete reachable graph once, including shared parts and cycles. Never fetch URLs. */
export function readChartResources(pkg: OpcPackage, chart: PartName, workbookId?: string): ChartResources | undefined {
  const parts = new Map<string, ChartResourcePart>();
  function visit(owner: PartName): readonly ChartResourceRelationship[] {
    return chartPartRelationships(pkg, owner).items.filter(item => owner.equivalenceKey !== chart.equivalenceKey || item.id !== workbookId).map(item => {
      if (item.targetMode === 'External') return { id: item.id, type: item.type, target: item.target, targetMode: 'External' };
      const part = pkg.getPart(item.targetPartName);
      if (!part) throw new TypeError(`Chart resource ${item.targetPartName.value} is missing.`);
      const key = part.name.equivalenceKey === chart.equivalenceKey ? '$chart' : part.name.value;
      if (key !== '$chart' && !parts.has(key)) {
        const value = { key, contentType: part.contentType, data: chartBytesToBase64(pkg.readPart(part)) };
        parts.set(key, value);
        const children = visit(part.name);
        if (children.length) parts.set(key, { ...value, relationships: children });
      }
      return { id: item.id, type: item.type, target: key, ...(item.fragment === undefined ? {} : { fragment: decodeURIComponent(item.fragment) }) };
    });
  }
  const root = visit(chart);
  return root.length ? { relationships: root, parts: [...parts.values()] } : undefined;
}

/** Copy on write isolates related assets shared with another chart. Existing graphs are reused. */
export function stageChartResources(transaction: PackageTransaction, chart: PartName, input: ChartResources, options: {
  readonly workbookId?: string | undefined; readonly conformance: 'strict' | 'transitional';
}): void {
  const resources = parseChartResources(input), pkg = transaction.package;
  const existing = pkg.getPart(chart) && readChartResources(pkg, chart, options.workbookId);
  const canonical = (value: ChartResources | undefined) => JSON.stringify(value && { parts: [...value.parts].sort((a, b) => a.key.localeCompare(b.key)), relationships: value.relationships });
  if (canonical(existing || undefined) === canonical(resources)) return;
  if (resources.relationships.some(item => item.id === options.workbookId)) throw new TypeError('Chart resources cannot replace the source workbook relationship.');
  const names = new Map<string, PartName>([['$chart', chart]]), used = new Set(pkg.parts.map(part => part.name.equivalenceKey));
  const stem = chart.value.replace(/\.xml$/i, '') + '-resources/part';
  const extensions: Readonly<Record<string, string>> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'webp' };
  let counter = 1;
  for (const part of resources.parts) {
    const extension = extensions[part.contentType] ?? (part.contentType.endsWith('+xml') || part.contentType === 'application/xml' ? 'xml' : 'bin');
    let name: PartName;
    do { name = PartName.parse(`${stem}${counter++}.${extension}`); } while (used.has(name.equivalenceKey));
    used.add(name.equivalenceKey); names.set(part.key, name);
    let bytes = chartBase64ToBytes(part.data);
    if (extension === 'xml') bytes = normalizeChartNamespaceDeclarations(parseLosslessXml(bytes), options.conformance);
    transaction.addPart(name, part.contentType, bytes);
  }
  const normalizeType = (type: string) => type.replace(options.conformance === 'strict' ? /^http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\// : /^http:\/\/purl\.oclc\.org\/ooxml\/officeDocument\/relationships\//,
    options.conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships/' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/');
  function add(owner: PartName, items: readonly ChartResourceRelationship[]) {
    for (const item of items) {
      const type = normalizeType(item.type);
      transaction.addRelationship(owner, item.targetMode === 'External' ? { id: item.id, type, target: item.target, targetMode: 'External' } : { id: item.id, type, target: names.get(item.target)!, ...(item.fragment === undefined ? {} : { fragment: item.fragment }) });
    }
  }
  for (const item of chartPartRelationships(pkg, chart).items) if (item.id !== options.workbookId) transaction.removeRelationship(chart, item.id);
  add(chart, resources.relationships);
  for (const part of resources.parts) add(names.get(part.key)!, part.relationships ?? []);
}
