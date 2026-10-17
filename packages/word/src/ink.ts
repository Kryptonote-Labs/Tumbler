import { wordInkTransform, transformedInkBounds } from './ink-transform.ts';
import { InkError, readOfficeInk, createOfficeInkScene, renderInkSceneSvg, type InkSvgOptions } from '@tumblerjs/ink';
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
    const scene = createOfficeInkScene(ink, options);
    if (!scene.supported) return { ...fallback, ink, inkSource, ...(fallback.kind === 'image' ? { inkRendering: 'bitmap' as const } : {}), inkRenderingDiagnostics: scene.diagnostics };
    const unavailable = (message: string): WordDrawing => ({ ...fallback, ink, inkSource, ...(fallback.kind === 'image' ? { inkRendering: 'bitmap' as const } : {}), inkRenderingDiagnostics: [{ elementId: element.id, code: 'rendering', message }] });
    let matrix;
    try { matrix = wordInkTransform(parts[0]!, original, scene.traceBounds); }
    catch (error) { if (!(error instanceof RangeError)) throw error; return unavailable(error.message); }
    const bounds = transformedInkBounds(scene.bounds, matrix);
    const rendered = renderInkSceneSvg(scene);
    const content = rendered.supported ? rendered.svg.slice(rendered.svg.indexOf('>') + 1, rendered.svg.lastIndexOf('</svg>')) : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}pt" height="${bounds.height}pt" viewBox="${bounds.x} ${bounds.y} ${bounds.width || 1} ${bounds.height || 1}"><g transform="matrix(${matrix.join(' ')})">${content}</g></svg>`;
    return {
      ...original, kind: 'image', elementId: element.id, fallback: 'ink', ink, inkSource, inkRendering: rendered.supported ? 'vector' : 'raster', inkProjection: { matrix, bounds, options: options ?? {} },
      ...(rendered.supported ? {} : { inkRenderingDiagnostics: rendered.diagnostics }),
      relationshipId: undefined, partName: undefined, contentType: !rendered.supported && fallback.kind === 'image' ? fallback.contentType : 'image/svg+xml',
      bytes: !rendered.supported && fallback.kind === 'image' ? fallback.bytes : new TextEncoder().encode(svg),
      widthPoints: bounds.width, heightPoints: bounds.height,
      anchor: original.anchor && { ...original.anchor,
        horizontalOffsetPoints: (original.anchor.horizontalOffsetPoints ?? 0) + bounds.x,
        verticalOffsetPoints: (original.anchor.verticalOffsetPoints ?? 0) + bounds.y },
    };
  } catch (error) {
    if (!(error instanceof InkError) && !(error instanceof LosslessXmlError)) throw error;
    return { ...fallback, inkSource: { partName: part.name, relationshipId: id! },
      ...(fallback.kind === 'image' ? { inkRendering: 'bitmap' as const } : {}),
      inkRenderingDiagnostics: [{ elementId: element.id, code: 'structure', message: error.message }] };
  }
}
