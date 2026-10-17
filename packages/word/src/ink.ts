import { InkError, readOfficeInk, renderOfficeInkSvg } from '@tumblerjs/ink';
import { LosslessXmlError, type LosslessXmlElement } from '@tumblerjs/ooxml';
import type { OpcPackage, Relationships } from '@tumblerjs/opc';
import type { WordDrawing } from './drawings.ts';
import { readWordInkFallback, wordInkChoice } from './ink-fallback.ts';

const relationshipNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const word2010 = 'http://schemas.microsoft.com/office/word/2010/wordml';
function contentParts(element: LosslessXmlElement): LosslessXmlElement[] {
  return element.children.flatMap(child => child.kind !== 'element' ? [] : [
    ...(child.namespaceUri === word2010 && child.localName === 'contentPart' ? [child] : []), ...contentParts(child),
  ]);
}
function hasInkGraphic(element: LosslessXmlElement): boolean {
  return element.children.some(child => child.kind === 'element' && (
    child.namespaceUri === 'http://schemas.openxmlformats.org/drawingml/2006/main' && child.localName === 'graphicData' && child.attributes.some(a => a.namespaceUri === '' && a.localName === 'uri' && a.value === 'http://schemas.microsoft.com/office/word/2010/wordprocessingInk') || hasInkGraphic(child)
  ));
}

/** The shared engine owns ink semantics; Word owns relationships, placement and its cached preview. */
export function readWordInkDrawing(element: LosslessXmlElement, original: WordDrawing, pkg: OpcPackage, relationships: Relationships | undefined): WordDrawing {
  const fallback = readWordInkFallback(element, original, pkg, relationships);
  const choice = element.localName === 'drawing' ? element : wordInkChoice(element);
  if (!choice || !hasInkGraphic(choice)) return fallback;
  const parts = choice && contentParts(choice);
  if (parts?.length !== 1) return fallback;
  const id = parts[0]!.attributes.find(a => a.namespaceUri === relationshipNamespace && a.localName === 'id')?.value;
  const relationship = id && relationships?.get(id);
  if (!relationship || relationship.targetMode !== 'Internal' || relationship.type !== `${relationshipNamespace}/customXml`) return fallback;
  const part = pkg.getPart(relationship.targetPartName);
  if (part?.contentType !== 'application/inkml+xml') return fallback;
  try {
    const ink = readOfficeInk(pkg.readPart(part));
    if (fallback.kind === 'image') return { ...fallback, ink, inkRendering: 'bitmap' };
    const rendered = renderOfficeInkSvg(ink);
    if (!rendered.supported) return { ...fallback, ink };
    // Native extents describe sample centres. Expand by the nib bounds before rasterizing the SVG.
    const { traceBounds, bounds } = rendered;
    const sx = traceBounds.width > 0 ? original.widthPoints / traceBounds.width : 1;
    const sy = traceBounds.height > 0 ? original.heightPoints / traceBounds.height : 1;
    const transform = parts[0]!.children.find(child => child.kind === 'element' && child.namespaceUri === word2010 && child.localName === 'xfrm');
    if (transform?.kind === 'element' && transform.attributes.some(a => ['rot', 'flipH', 'flipV'].includes(a.localName) && !['0', 'false'].includes(a.value))) return { ...fallback, ink };
    if (transform?.kind === 'element' && transform.children.some(child => child.kind === 'element' && child.localName === 'off' && child.attributes.some(a => ['x', 'y'].includes(a.localName) && Number(a.value) !== 0))) return { ...fallback, ink };
    if (!(sx > 0) || !(sy > 0) || !Number.isFinite(sx) || !Number.isFinite(sy) || original.anchor?.horizontalAlignment) return { ...fallback, ink };
    return {
      ...original, kind: 'image', elementId: element.id, fallback: 'ink', ink, inkRendering: 'vector',
      relationshipId: id!, partName: part.name, contentType: 'image/svg+xml', bytes: new TextEncoder().encode(rendered.svg),
      widthPoints: bounds.width * sx, heightPoints: bounds.height * sy,
      anchor: original.anchor && { ...original.anchor,
        horizontalOffsetPoints: (original.anchor.horizontalOffsetPoints ?? 0) + (bounds.x - traceBounds.x) * sx,
        verticalOffsetPoints: (original.anchor.verticalOffsetPoints ?? 0) + (bounds.y - traceBounds.y) * sy },
    };
  } catch (error) {
    if (!(error instanceof InkError) && !(error instanceof LosslessXmlError)) throw error;
    return fallback;
  }
}
