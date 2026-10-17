import { createOfficeInkScene, encodeInkPng, renderOfficeInkRaster, replaceOfficeInkTrace, type InkPoint, type InkRasterOptions } from '@tumblerjs/ink';
import { beginLosslessXmlEdit, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { beginPackageTransaction, relationshipItemName, isRelationshipPartName, relationshipSource } from '@tumblerjs/opc';
import { WordError, type WordDocument } from './document.ts';
import { inkFrame } from './ink-geometry.ts';
import { wordInkNamespaces } from './ink-fallback.ts';
import { wordInkTransform } from './ink-transform.ts';

export interface WordInkTraceChange {
  readonly elementId: number;
  readonly traceElementId: number;
  /** Samples in the trace's declared channel order and device coordinate system.
   * The edited ink occupies the existing DrawingML frame, as when Word reloads the part.
   */
  readonly points: readonly InkPoint[];
  /** Cached fallback composition. Destination-dependent pens require an explicit backdrop. */
  readonly preview?: Pick<InkRasterOptions, 'scale' | 'background' | 'destination' | 'maxPixels' | 'maxPoints' | 'curveTolerance'>;
}
const children = (node: LosslessXmlElement) => node.children.filter((child): child is LosslessXmlElement => child.kind === 'element');
const descendants = (node: LosslessXmlElement): LosslessXmlElement[] => children(node).flatMap(child => [child, ...descendants(child)]);
const vml = 'urn:schemas-microsoft-com:vml';
const office = 'urn:schemas-microsoft-com:office:office';
const mc = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const value = (node: LosslessXmlElement | undefined, name: string) => node?.attributes.find(a => a.localName === name && !a.namespaceUri)?.value;

/** Copy-on-write ink and bitmap parts are committed with their drawing references in one revision. */
export function replaceWordInkTrace(document: WordDocument, change: WordInkTraceChange): Uint8Array {
  const drawing = document.drawings.get(change.elementId);
  const element = document.source.element(change.elementId);
  if (!drawing?.ink || !drawing.inkSource || !element) throw new WordError('invalid_document', 'The drawing has no editable InkML source.');
  const trace = drawing.ink.traces.find(trace => trace.elementId === change.traceElementId);
  if (!trace) throw new WordError('invalid_document', 'The trace does not belong to this drawing.');
  if (trace.points.length === change.points.length && trace.points.every((point, index) => point.length === change.points[index]!.length && point.every((sample, channel) => sample === change.points[index]![channel]))) return document.bytes();
  const ink = replaceOfficeInkTrace(drawing.ink, change.traceElementId, change.points);
  const scene = createOfficeInkScene(ink, { ...document.inkRendering, ...change.preview });
  if (!scene.supported) throw new WordError('invalid_document', scene.diagnostics.map(d => d.message).join(' '));
  const frame = inkFrame(element), namespaces = wordInkNamespaces(frame);
  const content = descendants(frame).find(node => node.namespaceUri === 'http://schemas.microsoft.com/office/word/2010/wordml' && node.localName === 'contentPart');
  const reference = content?.attributes.find(a => a.namespaceUri === namespaces.relationships && a.localName === 'id');
  const extent = descendants(frame).find(node => node.localName === 'extent' && node.namespaceUri?.endsWith('/wordprocessingDrawing'));
  if (!content || !reference || !extent) throw new WordError('invalid_document', 'Ink drawing placement is incomplete.');
  const matrix = wordInkTransform(content, { ...drawing, widthPoints: Number(value(extent, 'cx')) / 12700, heightPoints: Number(value(extent, 'cy')) / 12700 }, scene.traceBounds);
  const transaction = beginPackageTransaction(document.package), editor = beginLosslessXmlEdit(document.source);
  const relationships = document.package.relationships(document.part.name);
  const freshPart = (directory: string, extension: string) => {
    let index = 1;
    while (document.package.getPart(`${directory}${index}.${extension}`)) index++;
    return `${directory}${index}.${extension}`;
  };
  const freshId = (prefix: string) => { let index = 1; while (relationships.get(`${prefix}${index}`)) index++; return `${prefix}${index}`; };
  const exclusive = (partName: string, id: string) => {
    let incoming = 0;
    for (const part of document.package.parts) {
      if (!isRelationshipPartName(part.name)) continue;
      const source = relationshipSource(part.name);
      if (source === undefined) continue;
      for (const relation of document.package.relationships(source).items) {
        if (relation.targetMode === 'Internal' && relation.targetPartName.value === partName) incoming++;
      }
    }
    const uses = [...document.source.elements()].flatMap(node => node.attributes).filter(attribute => attribute.namespaceUri === namespaces.relationships && attribute.value === id).length;
    return incoming === 1 && uses === 1;
  };
  const originalInk = drawing.inkSource.partName;
  if (exclusive(originalInk.value, reference.value)) transaction.replacePart(originalInk, ink.source.originalBytes());
  else {
    const inkPart = freshPart('/word/ink/edited', 'xml'), inkId = freshId('inkEdit');
    transaction.addPart(inkPart, 'application/inkml+xml', ink.source.originalBytes());
    transaction.addRelationship(document.part.name, { id: inkId, type: `${namespaces.relationships}/customXml`, target: inkPart });
    // Preserve outgoing relationships of a copied ink part, including extension metadata.
    for (const relationship of (document.package.archive.get(relationshipItemName(originalInk)) ? document.package.relationships(originalInk).items : [])) transaction.addRelationship(inkPart, relationship.targetMode === 'External'
      ? { id: relationship.id, type: relationship.type, targetMode: 'External', target: relationship.target }
      : { id: relationship.id, type: relationship.type, target: relationship.targetPartName });
    editor.setAttribute(reference, inkId);
  }
  const fallback = children(element).find(node => node.namespaceUri === mc && node.localName === 'Fallback');
  if (fallback) {
    const shapes = descendants(fallback).filter(node => node.namespaceUri === vml && node.localName === 'shape');
    const shape = shapes.length === 1 ? shapes[0] : undefined;
    const image = shape && children(shape).find(node => node.namespaceUri === vml && node.localName === 'imagedata');
    const imageReference = image?.attributes.find(a => a.namespaceUri === namespaces.relationships && a.localName === 'id');
    const style = shape?.attributes.find(a => !a.namespaceUri && a.localName === 'style');
    if (!shape || !imageReference || !style) throw new WordError('invalid_document', 'Cannot regenerate an unrecognized ink fallback.');
    const raster = renderOfficeInkRaster(ink, { ...document.inkRendering, ...change.preview, transform: matrix });
    if (!raster.supported) throw new WordError('invalid_document', raster.diagnostics.map(d => d.message).join(' '));
    const bitmapRelation = relationships.get(imageReference.value);
    const oldBitmap = bitmapRelation?.targetMode === 'Internal' ? document.package.getPart(bitmapRelation.targetPartName) : undefined;
    const png = encodeInkPng(raster.width, raster.height, raster.data);
    if (oldBitmap?.contentType === 'image/png' && exclusive(oldBitmap.name.value, imageReference.value)) transaction.replacePart(oldBitmap.name, png);
    else {
      const bitmapPart = freshPart('/word/media/inkEdit', 'png'), bitmapId = freshId('inkBitmap');
      transaction.addPart(bitmapPart, 'image/png', png);
      transaction.addRelationship(document.part.name, { id: bitmapId, type: `${namespaces.relationships}/image`, target: bitmapPart });
      editor.setAttribute(imageReference, bitmapId);
    }
    const position = (axis: string) => {
      const node = descendants(frame).find(node => node.localName === `position${axis}`);
      const offset = node && children(node).find(node => node.localName === 'posOffset');
      return offset ? Number(document.source.textContent(offset)) / 12700 : 0;
    };
    const properties = new Map(style.value.split(';').filter(Boolean).map(entry => { const colon = entry.indexOf(':'); return [entry.slice(0, colon).trim().toLowerCase(), entry.slice(colon + 1).trim()]; }));
    properties.set('width', `${raster.bounds.width}pt`); properties.set('height', `${raster.bounds.height}pt`);
    // Rotation/flips are baked into the generated pixels, not applied a second time by VML.
    properties.delete('rotation'); properties.delete('flip');
    if (drawing.placement === 'anchor') {
      properties.set('margin-left', `${position('H') + raster.bounds.x}pt`);
      properties.set('margin-top', `${position('V') + raster.bounds.y}pt`);
    }
    editor.setAttribute(style, [...properties].map(([name, value]) => `${name}:${value}`).join(';'));
    for (const node of [shape, ...descendants(shape)]) for (const attribute of node.attributes) {
      if (attribute.namespaceUri === office && attribute.localName === 'gfxdata') editor.removeAttribute(attribute);
    }
  }
  transaction.replacePart(document.part.name, editor.commit().bytes);
  return transaction.commit();
}
