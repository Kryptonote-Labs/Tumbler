import { ChartParseError, parseOoxmlChart } from './parser.ts';
import type { ChartModel } from './model.ts';
import { beginLosslessXmlEdit } from '@tumblerjs/ooxml';
import { openOpcPackage, PartName, Relationships, RelationshipsError, type OpcPackage, type PackageTransaction } from '@tumblerjs/opc';
import { chartXml, chartXmlText } from './source-xml.ts';

/** Portable chart content for host commands and collaboration, independent of local part names. */
export interface ChartContent {
  readonly xml: string;
  /** Base64 of the editable embedded XLSX; omission retains the existing source workbook. */
  readonly workbook?: string | undefined;
}
export function chartBytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}
export function chartBase64ToBytes(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new TypeError('Invalid workbook encoding.');
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}


/** Validate the embedded package, not just its base64 envelope. */
export function decodeChartWorkbook(value: string): Uint8Array {
  const bytes = chartBase64ToBytes(value);
  if (openOpcPackage(bytes).mainOfficeDocumentPart().family !== 'spreadsheet') throw new TypeError('Chart data requires an XLSX workbook.');
  return bytes;
}
export function mergeChartContent(previous: ChartContent, next: ChartContent): ChartContent {
  return next.workbook === undefined && previous.workbook !== undefined ? { ...next, workbook: previous.workbook } : next;
}

/** Read the embedded source only through the chart's explicit relationship, never a network URL. */
export function readChartContent(pkg: OpcPackage, partName: PartName | string, options: { readonly includeWorkbook?: boolean } = {}): ChartContent {
  const part = pkg.getPart(partName);
  if (!part || part.contentType !== 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml') throw new TypeError('Chart part is missing.');
  const bytes = pkg.readPart(part);
  const source = chartXml(bytes);
  const external = source.children(source.document.root, 'externalData')[0];
  const relNs = source.namespace.includes('purl.oclc.org') ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const id = external?.attributes.find(attribute => attribute.namespaceUri === relNs && attribute.localName === 'id')?.value;
  const relationship = id && pkg.relationships(part.name).get(id);
  const workbook = relationship && relationship.targetMode === 'Internal' && relationship.type === `${relNs}/package` ? pkg.getPart(relationship.targetPartName) : undefined;
  return { xml: source.document.source.replace(/^(\s*<\?xml[^?]*?encoding\s*=\s*['"])utf-16(?:le|be)?(?=['"])/i, '$1UTF-8'), ...(options.includeWorkbook !== false && workbook?.contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ? { workbook: chartBytesToBase64(pkg.readPart(workbook)) } : {}) };
}

/** Stage the chart and embedded workbook together in the owning host's undo/save transaction. */
function stageChartContent(transaction: PackageTransaction, partName: PartName | string, content: ChartContent, addition = false): void {
  const name = typeof partName === 'string' ? PartName.parse(partName) : partName;
  const original = transaction.package.getPart(name);
  if (!addition && (!original || original.contentType !== 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml')) throw new TypeError('Chart part is missing.');
  let bytes: Uint8Array = new TextEncoder().encode(content.xml);
  let source = chartXml(bytes);
  const old = original && chartXml(transaction.package.readPart(original));
  const oldExternal = old && old.children(old.document.root, 'externalData')[0];
  const incomingExternal = source.children(source.document.root, 'externalData')[0];
  if (!incomingExternal && oldExternal && old) {
    const declarations = old.document.root.attributes.filter(attribute => attribute.namespaceUri === 'http://www.w3.org/2000/xmlns/' && !oldExternal.attributes.some(own => own.qualified === attribute.qualified)).map(attribute => ` ${attribute.qualified}="${chartXmlText(attribute.value)}"`).join('');
    const markup = old.markup(oldExternal).replace(new RegExp(`^<${oldExternal.qualified}(?=[\\s/>])`), `<${oldExternal.qualified}${declarations}`);
    const edit = beginLosslessXmlEdit(source.document);
    const following = source.children(source.document.root).find(child => ['printSettings', 'userShapes', 'extLst'].includes(child.localName));
    if (following) edit.insertMarkupBefore(following, markup); else edit.appendMarkup(source.document.root, markup);
    bytes = edit.commit().bytes;
    source = chartXml(bytes);
  }
  if (addition) transaction.addPart(name, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml', bytes);
  if (content.workbook !== undefined) {
    const workbook = decodeChartWorkbook(content.workbook);
    const relNs = source.namespace.includes('purl.oclc.org') ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const external = source.children(source.document.root, 'externalData')[0];
    const id = external?.attributes.find(attribute => attribute.namespaceUri === relNs && attribute.localName === 'id')?.value;
    let relationships: Relationships;
    try { relationships = transaction.package.relationships(name); } catch (error) {
      if (!(error instanceof RelationshipsError) || error.code !== 'missing_item') throw error;
      relationships = new Relationships(name, []);
    }
    const existing = id && relationships.get(id);
    if (existing && existing.targetMode === 'Internal' && existing.type === `${relNs}/package`) {
      const part = transaction.package.getPart(existing.targetPartName);
      if (part?.contentType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') throw new TypeError('The chart source is not an XLSX workbook.');
      transaction.replacePart(part.name, workbook);
    } else {
      const host = name.value.split('/').slice(0, -2).join('/');
      const stem = name.value.split('/').at(-1)!.replace(/\.xml$/i, '');
      let workbookName = `${host}/embeddings/${stem}-data.xlsx`;
      for (let index = 1; transaction.package.getPart(workbookName); index++) workbookName = `${host}/embeddings/${stem}-data-${index}.xlsx`;
      const used = new Set(relationships.items.map(relationship => relationship.id));
      let relationshipId = 'tumbler-chart-data';
      for (let suffix = 1; used.has(relationshipId); suffix++) relationshipId = `tumbler-chart-data-${suffix}`;
      transaction.addPart(workbookName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', workbook);
      transaction.addRelationship(name, { id: relationshipId, type: `${relNs}/package`, target: workbookName });
      const edit = beginLosslessXmlEdit(source.document);
      const markup = `<c:externalData xmlns:c="${source.namespace}" xmlns:r="${relNs}" r:id="${relationshipId}"><c:autoUpdate val="0"/></c:externalData>`;
      if (external) edit.replaceElementMarkup(external, markup);
      else {
        const following = source.children(source.document.root).find(child => ['printSettings', 'userShapes', 'extLst'].includes(child.localName));
        if (following) edit.insertMarkupBefore(following, markup); else edit.appendMarkup(source.document.root, markup);
      }
      bytes = edit.commit().bytes;
    }
  }
  transaction.replacePart(name, bytes);
}

export function writeChartContent(transaction: PackageTransaction, partName: PartName | string, content: ChartContent): void {
  stageChartContent(transaction, partName, content);
}
export function addChartContent(transaction: PackageTransaction, partName: PartName | string, content: ChartContent): void {
  stageChartContent(transaction, partName, content, true);
}

/** Keep valid source authorable even when a bounded preview cannot materialize it. */
export function chartContentModel(content: ChartContent): ChartModel {
  const bytes = new TextEncoder().encode(content.xml);
  const source = chartXml(bytes);
  try { return parseOoxmlChart(bytes, source.namespace.includes('purl.oclc.org') ? 'strict' : 'transitional'); }
  catch (error) {
    if (!(error instanceof ChartParseError)) throw error;
    return { status: 'unsupported', chartType: undefined, reason: error.message, title: undefined, legend: undefined };
  }
}
