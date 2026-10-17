import { InkError, readOfficeInk, renderOfficeInkSvg, type InkSvgOptions } from '@tumblerjs/ink';
import { LosslessXmlError, type LosslessXmlElement } from '@tumblerjs/ooxml';
import type { OpcPackage, Relationships } from '@tumblerjs/opc';
import type { WordDrawing } from './drawings.ts';
import { readWordInkFallback, wordInkChoice, isWordInkDrawing, wordInkNamespaces } from './ink-fallback.ts';

const relationshipNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const word2010 = 'http://schemas.microsoft.com/office/word/2010/wordml';
function contentParts(element: LosslessXmlElement): LosslessXmlElement[] {
  return element.children.flatMap(child => child.kind !== 'element' ? [] : [
    ...(child.namespaceUri === word2010 && child.localName === 'contentPart' ? [child] : []), ...contentParts(child),
  ]);
}
/** The shared engine owns ink semantics; Word owns relationships, placement and its cached preview. */
export function readWordInkDrawing(element: LosslessXmlElement, original: WordDrawing, pkg: OpcPackage, relationships: Relationships | undefined, options?: InkSvgOptions): WordDrawing {
  return Object.freeze(projectWordInkDrawing(element, original, pkg, relationships, options));
}

function projectWordInkDrawing(element: LosslessXmlElement, original: WordDrawing, pkg: OpcPackage, relationships: Relationships | undefined, options?: InkSvgOptions): WordDrawing {
  const choice = isWordInkDrawing(element) ? element : wordInkChoice(element);
  if (!choice) return original;
  const fallback = readWordInkFallback(element, original, pkg, relationships);
  const namespaces = wordInkNamespaces(choice);
  const parts = contentParts(choice);
  if (parts.length !== 1) return fallback;
  const id = parts[0]!.attributes.find(a => a.namespaceUri === namespaces.relationships && a.localName === 'id')?.value;
  const relationship = id && relationships?.get(id);
  if (!relationship || relationship.targetMode !== 'Internal' || ![`${namespaces.relationships}/customXml`, `${relationshipNamespace}/customXml`].includes(relationship.type)) return fallback;
  const part = pkg.getPart(relationship.targetPartName);
  if (part?.contentType !== 'application/inkml+xml') return fallback;
  try {
    const ink = readOfficeInk(pkg.readPart(part));
    const inkSource = { partName: part.name, relationshipId: id! };
    if (fallback.kind === 'image') return { ...fallback, ink, inkSource, inkRendering: 'bitmap' };
    const rendered = renderOfficeInkSvg(ink, options);
    if (!rendered.supported) return { ...fallback, ink, inkSource, inkRenderingDiagnostics: rendered.diagnostics };
    const unavailable = (message: string): WordDrawing => ({ ...fallback, ink, inkSource, inkRenderingDiagnostics: [{ elementId: element.id, code: 'rendering', message }] });
    // Preview convention: fit sample-centre bounds to the frame on each axis, then
    // expand for the nib. This is an approximation, not a verified Word transform.
    const { traceBounds, bounds } = rendered;
    const sx = original.widthPoints / (traceBounds.width || bounds.width);
    const sy = original.heightPoints / (traceBounds.height || bounds.height);
    const transform = parts[0]!.children.find(child => child.kind === 'element' && child.namespaceUri === word2010 && child.localName === 'xfrm');
    if (transform?.kind === 'element' && transform.attributes.some(a => ['rot', 'flipH', 'flipV'].includes(a.localName) && !['0', 'false'].includes(a.value))) return unavailable('This ink drawing transform is not supported by the vector preview.');
    if (transform?.kind === 'element' && transform.children.some(child => child.kind === 'element' && child.localName === 'off' && child.attributes.some(a => ['x', 'y'].includes(a.localName) && Number(a.value) !== 0))) return unavailable('This ink drawing transform is not supported by the vector preview.');
    if (!(sx > 0) || !(sy > 0) || !Number.isFinite(sx) || !Number.isFinite(sy) || original.anchor?.horizontalAlignment) return unavailable('This ink drawing transform is not supported by the vector preview.');
    return {
      ...original, kind: 'image', elementId: element.id, fallback: 'ink', ink, inkSource, inkRendering: 'vector',
      relationshipId: undefined, partName: undefined, contentType: 'image/svg+xml', bytes: new TextEncoder().encode(rendered.svg),
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
