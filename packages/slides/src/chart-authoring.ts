import { addChartContent, readChartContent, writeChartContent, type ChartContent } from '@tumblerjs/charts';
import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { beginPackageTransaction } from '@tumblerjs/opc';
import type { PresentationDocument } from './model.ts';
import { openPresentationArtifact, type PresentationArtifact } from './artifact.ts';
import { objectTarget, type ObjectBounds } from './authoring-objects.ts';
import { children, editable, slideById } from './authoring-slides.ts';
import { emu, partXml } from './authoring-xml.ts';

function chartTarget(document: PresentationDocument, slideId: string, objectKey: string) {
  const slide = document.slides.find(slide => slide.id === slideId);
  const object = slide?.objects.find(object => object.key === objectKey);
  const pkg = document.package;
  const part = slide && pkg.getPart(slide.part);
  if (!slide || !object || object.kind !== 'chart' || !part) throw new TypeError('Select a chart on this slide.');
  const source = parseLosslessXml(pkg.readPart(part));
  const element = source.element(object.elementId);
  if (!element) throw new TypeError('Chart frame is missing.');
  const reference = source.elements().find(node => node.localName === 'chart' && node.span.start >= element.span.start && node.span.end <= element.span.end && node.namespaceUri.includes('drawingml/') && node.namespaceUri.endsWith('/chart'));
  const id = reference?.attributes.find(attribute => attribute.localName === 'id' && attribute.namespaceUri.endsWith('/relationships'))?.value;
  const relation = id && pkg.relationships(part.name).get(id);
  if (!relation || relation.targetMode !== 'Internal' || !relation.type.endsWith('/chart')) throw new TypeError('Chart relationship is missing.');
  return { partName: relation.targetPartName, object };
}

export function presentationChartContent(document: PresentationDocument, slideId: string, objectKey: string): ChartContent {
  const existing = document.slides.find(slide => slide.id === slideId)?.objects.find(object => object.key === objectKey)?.chartContent;
  if (existing?.workbook !== undefined) return existing;
  const content = readChartContent(document.package, chartTarget(document, slideId, objectKey).partName);
  return existing ? { ...content, ...existing, ...(existing.workbook === undefined && content.workbook !== undefined ? { workbook: content.workbook } : {}) } : content;
}

export function editPresentationChart(artifact: PresentationArtifact, slideId: string, objectKey: string, content: ChartContent): PresentationArtifact {
  objectTarget(artifact, slideId, objectKey);
  const target = chartTarget(artifact.document, slideId, objectKey);
  const transaction = beginPackageTransaction(artifact.document.package);
  writeChartContent(transaction, target.partName, content);
  return openPresentationArtifact(transaction.commit(), artifact.options);
}

/** Insert an editable native chart frame with an optional embedded source workbook. */
export function insertPresentationChart(artifact: PresentationArtifact, slideId: string, bounds: ObjectBounds, content: ChartContent): PresentationArtifact {
  editable(artifact);
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) throw new RangeError('Chart dimensions must be positive.');
  const slide = slideById(artifact, slideId), source = partXml(artifact, slide.part);
  const tree = children(children(source.root).find(element => element.localName === 'cSld')!).find(element => element.localName === 'spTree');
  if (!tree) throw new TypeError('Slide object tree is missing.');
  const pkg = artifact.document.package, transaction = beginPackageTransaction(pkg);
  let index = 1;
  while (pkg.getPart(`/ppt/charts/chart${index}.xml`)) index++;
  const chartName = `/ppt/charts/chart${index}.xml`;
  const owner = pkg.getPart(slide.part)!;
  const ids = new Set(pkg.relationships(owner.name).items.map(relationship => relationship.id));
  let relationshipId = `chart${index}`;
  while (ids.has(relationshipId)) relationshipId += '_';
  const id = Math.max(0, ...source.elements().filter(element => element.localName === 'cNvPr').map(element => Number(element.attributes.find(attribute => attribute.localName === 'id')?.value ?? 0))) + 1;
  const strict = artifact.document.conformance === 'strict';
  const p = source.root.namespaceUri;
  const a = strict ? 'http://purl.oclc.org/ooxml/drawingml/main' : 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const c = strict ? 'http://purl.oclc.org/ooxml/drawingml/chart' : 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  const r = strict ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  addChartContent(transaction, chartName, content);
  transaction.addRelationship(owner.name, { id: relationshipId, type: `${r}/chart`, target: chartName });
  const markup = `<p:graphicFrame xmlns:p="${p}" xmlns:a="${a}" xmlns:c="${c}" xmlns:r="${r}"><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Chart ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(bounds.x)}" y="${emu(bounds.y)}"/><a:ext cx="${emu(bounds.width)}" cy="${emu(bounds.height)}"/></p:xfrm><a:graphic><a:graphicData uri="${c}"><c:chart r:id="${relationshipId}"/></a:graphicData></a:graphic></p:graphicFrame>`;
  const edit = beginLosslessXmlEdit(source);
  const extension = children(tree).find(element => element.localName === 'extLst');
  if (extension) edit.insertMarkupBefore(extension, markup); else edit.appendMarkup(tree, markup);
  transaction.replacePart(owner.name, edit.commit().bytes);
  return openPresentationArtifact(transaction.commit(), artifact.options);
}
