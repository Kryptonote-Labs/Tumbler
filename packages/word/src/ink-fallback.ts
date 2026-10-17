import { OOXML_NAMESPACES, type LosslessXmlElement } from '@tumblerjs/ooxml';
import type { OpcPackage, Relationships } from '@tumblerjs/opc';
import type { WordDrawing, WordImageDrawing } from './drawings.ts';

const mc = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const vml = 'urn:schemas-microsoft-com:vml';
const ink = 'http://schemas.microsoft.com/office/word/2010/wordprocessingInk';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
/** Office ink is an extension; its surrounding drawing vocabulary follows the host. */
export function wordInkNamespaces(frame: LosslessXmlElement) {
  const strict = frame.namespaceUri === OOXML_NAMESPACES.strict.wordprocessing;
  return { ...OOXML_NAMESPACES[strict ? 'strict' : 'transitional'], relationships: strict ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : rel };
}
export function isWordInkDrawing(frame: LosslessXmlElement): boolean {
  if (frame.localName !== 'drawing' || ![OOXML_NAMESPACES.strict.wordprocessing, OOXML_NAMESPACES.transitional.wordprocessing].some(ns => ns === frame.namespaceUri)) return false;
  return descendants(frame).some(e => e.namespaceUri === wordInkNamespaces(frame).drawing && e.localName === 'graphicData' && attr(e, 'uri') === ink);
}
const children = (e: LosslessXmlElement) => e.children.filter((n): n is LosslessXmlElement => n.kind === 'element');
const descendants = (e: LosslessXmlElement): LosslessXmlElement[] => children(e).flatMap(n => [n, ...descendants(n)]);
const attr = (e: LosslessXmlElement, name: string, ns = '') => e.attributes.find(a => a.namespaceUri === ns && a.localName === name)?.value;

/** Keep the alternate-content wrapper as one object so export retains both representations. */
export function wordInkChoice(element: LosslessXmlElement): LosslessXmlElement | undefined {
  if (element.namespaceUri !== mc || element.localName !== 'AlternateContent') return;
  const choices = children(element).filter(e => e.namespaceUri === mc && e.localName === 'Choice');
  if (choices.length !== 1) return;
  const frames = children(choices[0]!).filter(e => isWordInkDrawing(e));
  if (frames.length !== 1 || children(choices[0]!).length !== 1) return;
  return frames[0];
}

/** Word's VML bitmap includes pen extents that differ from the ink trace's anchor bounds. */
export function readWordInkFallback(element: LosslessXmlElement, original: WordDrawing, pkg: OpcPackage, relationships: Relationships | undefined): WordDrawing {
  const unsupported = element.id === original.elementId ? original : Object.freeze({ ...original, elementId: element.id });
  const frame = wordInkChoice(element);
  const relationshipNamespace = frame ? wordInkNamespaces(frame).relationships : rel;
  const fallback = children(element).find(e => e.namespaceUri === mc && e.localName === 'Fallback');
  const shapes = fallback && descendants(fallback).filter(e => e.namespaceUri === vml && e.localName === 'shape');
  if (shapes?.length !== 1) return unsupported;
  const shape = shapes[0]!;
  const image = children(shape).find(e => e.namespaceUri === vml && e.localName === 'imagedata');
  const id = image && attr(image, 'id', relationshipNamespace);
  const relationship = id && relationships?.get(id);
  if (!relationship || relationship.targetMode !== 'Internal' || relationship.type !== `${relationshipNamespace}/image`) return unsupported;
  const part = pkg.getPart(relationship.targetPartName);
  // Use browser-safe raster fallbacks only; never fetch an external relationship.
  if (!part || !['image/png', 'image/jpeg', 'image/gif'].includes(part.contentType)) return unsupported;
  const style = new Map((attr(shape, 'style') ?? '').split(';').map(s => {
    const colon = s.indexOf(':');
    return [s.slice(0, colon).trim().toLowerCase(), s.slice(colon + 1).trim().toLowerCase()];
  }));
  const points = (name: string) => {
    const match = /^(-?(?:\d+(?:\.\d*)?|\.\d+))(pt|in|cm|mm|px)?$/.exec(style.get(name) ?? '');
    if (!match) return undefined;
    const scale = { pt: 1, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, px: .75 };
    const unit = match[2] as keyof typeof scale | undefined;
    const value = Number(match[1]) * (unit ? scale[unit] : 1);
    return Number.isFinite(value) ? value : undefined;
  };
  const width = points('width'), height = points('height');
  if (width === undefined || height === undefined || width <= 0 || height <= 0) return unsupported;
  if (style.get('position') !== 'absolute' || !original.anchor) return unsupported;
  const horizontal = style.get('mso-position-horizontal-relative');
  const vertical = style.get('mso-position-vertical-relative');
  if (horizontal !== 'text' && horizontal !== 'page' && horizontal !== 'margin') return unsupported;
  if (vertical !== 'text' && vertical !== 'page' && vertical !== 'margin') return unsupported;
  const x = points('margin-left'), y = points('margin-top');
  if (x === undefined || y === undefined) return unsupported;
  return {
    ...original, kind: 'image', elementId: element.id, fallback: 'ink', relationshipId: id!,
    partName: part.name, contentType: part.contentType, bytes: pkg.readPart(part),
    widthPoints: width, heightPoints: height,
    anchor: { ...original.anchor, horizontalRelativeTo: horizontal === 'text' ? 'column' : horizontal,
      verticalRelativeTo: vertical === 'text' ? 'paragraph' : vertical, horizontalOffsetPoints: x, verticalOffsetPoints: y },
  } satisfies WordImageDrawing;
}
