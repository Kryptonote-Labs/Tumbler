import {
  InkError,
  createOfficeInkScene,
  inkChannelScale,
  readOfficeInk,
  renderInkSceneSvg,
  type OfficeInkDocument,
  type InkSceneResult,
} from '@tumblerjs/ink';
import { LosslessXmlError, type LosslessXmlElement } from '@tumblerjs/ooxml';
import type { OpcPackage } from '@tumblerjs/opc';
import type { DrawingPictureFill } from './appearance.ts';
import type { Matrix, SlideObject, SlideTransform } from './model.ts';
import { multiply, shapeMatrix, transformPoint } from './geometry.ts';

export interface PresentationInk {
  readonly document: OfficeInkDocument;
  readonly scene: Extract<InkSceneResult, { supported: true }>;
  readonly partName: string;
  /** Samples in physical points mapped into the picture's local CSS pixels. */
  readonly sampleMatrix: Matrix;
}
export const POWERPOINT_INK = 'http://schemas.microsoft.com/office/powerpoint/2010/main';
const children = (e: LosslessXmlElement) => e.children.filter((c) => c.kind === 'element');
/** Interpret native ink while retaining the compatibility image for unsupported Office ink. */
export function readPresentationInk(
  pkg: OpcPackage,
  sourcePart: string,
  content: LosslessXmlElement,
  frame: SlideTransform,
) {
  const rid = content.attributes.find(
    (a) => a.localName === 'id' && a.namespaceUri?.endsWith('/relationships'),
  )?.value;
  const source = pkg.getPart(sourcePart);
  const rel = source && rid ? pkg.relationships(source.name).get(rid) : undefined;
  if (!rel || rel.targetMode !== 'Internal' || !rel.type.endsWith('/customXml')) return;
  const part = pkg.getPart(rel.targetPartName);
  if (part?.contentType !== 'application/inkml+xml') return;
  try {
    const document = readOfficeInk(pkg.readPart(part));
    const options = { renderingProfile: 'word', maxPoints: Infinity } as const;
    const scene = createOfficeInkScene(document, options);
    if (!scene.supported) return;
    const transform = children(content).find(
      (e) => e.localName === 'xfrm' && e.namespaceUri === POWERPOINT_INK,
    );
    const off = transform && children(transform).find((e) => e.localName === 'off');
    const ext = transform && children(transform).find((e) => e.localName === 'ext');
    const number = (e: LosslessXmlElement | undefined, name: string, fallback: number) =>
      Number(e?.attributes.find((a) => a.localName === name)?.value ?? fallback);
    const native: SlideTransform = {
      x: number(off, 'x', frame.x * 9525) / 9525,
      y: number(off, 'y', frame.y * 9525) / 9525,
      width: number(ext, 'cx', frame.width * 9525) / 9525,
      height: number(ext, 'cy', frame.height * 9525) / 9525,
      rotation: number(transform, 'rot', 0) / 60000,
      flipH: ['1', 'true'].includes(
        transform?.attributes.find((a) => a.localName === 'flipH')?.value ?? '',
      ),
      flipV: ['1', 'true'].includes(
        transform?.attributes.find((a) => a.localName === 'flipV')?.value ?? '',
      ),
    };
    const [a, b, c, d, e, f] = shapeMatrix(frame);
    const det = a * d - b * c;
    const inverse: Matrix = [
      d / det,
      -b / det,
      -c / det,
      a / det,
      (c * f - d * e) / det,
      (b * e - a * f) / det,
    ];
    const sx = native.width / (scene.traceBounds.width || 72 / 2540);
    const sy = native.height / (scene.traceBounds.height || 72 / 2540);
    const sampleMatrix = multiply(
      inverse,
      multiply(shapeMatrix(native), [
        sx,
        0,
        0,
        sy,
        -scene.traceBounds.x * sx,
        -scene.traceBounds.y * sy,
      ]),
    );
    const [ma, mb, mc, md, me, mf] = sampleMatrix;
    const matrix: Matrix = [ma * 0.75, mb * 0.75, mc * 0.75, md * 0.75, me * 0.75, mf * 0.75];
    if (!matrix.every(Number.isFinite) || native.width <= 0 || native.height <= 0) return;
    const projected = createOfficeInkScene(document, {
      ...options,
      sampleTransform: matrix,
      brushRotation: Math.atan2(mb, ma),
      brushReflection: ma * md - mb * mc < 0,
    });
    if (!projected.supported) return;
    const rendered = renderInkSceneSvg(projected);
    if (!rendered.supported) return;
    const body = rendered.svg.slice(
      rendered.svg.indexOf('>') + 1,
      rendered.svg.lastIndexOf('</svg>'),
    );
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${frame.width * 0.75} ${frame.height * 0.75}" width="${frame.width}" height="${frame.height}">${body}</svg>`;
    const image: DrawingPictureFill = {
      bytes: new TextEncoder().encode(svg),
      contentType: 'image/svg+xml',
      crop: [0, 0, 0, 0],
    };
    return {
      ink: {
        document,
        scene: projected,
        partName: part.name.value,
        sampleMatrix,
      } satisfies PresentationInk,
      image,
    };
  } catch (error) {
    if (!(error instanceof InkError) && !(error instanceof LosslessXmlError)) throw error;
    return;
  }
}

/** Editable sample centres in slide coordinates, retaining stroke boundaries for hit testing. */
export function presentationInkPoints(object: SlideObject) {
  const ink = object.ink;
  if (!ink) return [];
  const matrix = multiply(object.matrix, ink.sampleMatrix);
  return ink.document.traces.flatMap((trace) => {
    const xi = trace.channels.findIndex((c) => c.name === 'X');
    const yi = trace.channels.findIndex((c) => c.name === 'Y');
    const sx = inkChannelScale(trace.channels[xi]),
      sy = inkChannelScale(trace.channels[yi]);
    if (sx === undefined || sy === undefined) return [];
    return trace.points.flatMap((p) =>
      typeof p[xi] !== 'number' || typeof p[yi] !== 'number'
        ? []
        : [
            {
              ...transformPoint(matrix, p[xi] * sx, p[yi] * sy),
              traceElementId: trace.elementId,
            },
          ],
    );
  });
}

/** Stroke erasing follows the swept pointer segment, including sparse/coalesced input events. */
export function hitPresentationInk(
  object: SlideObject,
  from: { x: number; y: number },
  to = from,
  radius = 8,
) {
  if (!object.movable || !object.ink) return false;
  const distance = (p: typeof from, a: typeof from, b: typeof from) => {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
    );
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  const cross = (a: typeof from, b: typeof from, c: typeof from) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const touches = (a: typeof from, b: typeof from) => {
    const opposite = (a: number, b: number) => (a < 0 && b > 0) || (a > 0 && b < 0);
    return (
      (opposite(cross(from, to, a), cross(from, to, b)) &&
        opposite(cross(a, b, from), cross(a, b, to))) ||
      Math.min(
        distance(from, a, b),
        distance(to, a, b),
        distance(a, from, to),
        distance(b, from, to),
      ) <= radius
    );
  };
  const matrix = multiply(object.matrix, [1 / 0.75, 0, 0, 1 / 0.75, 0, 0]);
  return object.ink.scene.strokes.some(
    (stroke) =>
      stroke.brush.transparency < 255 &&
      stroke.brush.rasterOp !== 'noOperation' &&
      stroke.shapes.some((shape) => {
        // Flatten ellipses to the same physical tolerance used for shared ink geometry.
        const count =
          shape.kind === 'ellipse'
            ? Math.max(16, Math.ceil(Math.PI * Math.sqrt(Math.max(shape.rx, shape.ry) / 0.05)))
            : 0;
        const vertices =
          shape.kind === 'polygon'
            ? shape.points
            : Array.from({ length: count }, (_, i) => {
                const angle = (i * 2 * Math.PI) / count,
                  x = shape.rx * Math.cos(angle),
                  y = shape.ry * Math.sin(angle);
                return {
                  x: shape.x + Math.cos(shape.angle) * x - Math.sin(shape.angle) * y,
                  y: shape.y + Math.sin(shape.angle) * x + Math.cos(shape.angle) * y,
                };
              });
        const polygon = vertices.map((p) => transformPoint(matrix, p.x, p.y));
        const contains = (p: typeof from) => {
          let positive = false,
            negative = false;
          for (let i = 0; i < polygon.length; i++) {
            const side = cross(polygon[i]!, polygon[(i + 1) % polygon.length]!, p);
            if (side > 0) positive = true;
            if (side < 0) negative = true;
          }
          return polygon.length >= 3 && !(positive && negative);
        };
        return (
          contains(from) ||
          contains(to) ||
          polygon.some((p, i) => touches(p, polygon[(i + 1) % polygon.length]!))
        );
      }),
  );
}
