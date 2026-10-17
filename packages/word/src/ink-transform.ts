import type { InkBounds } from '@tumblerjs/ink';
import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import type { WordDrawing } from './drawings.ts';

export type InkMatrix = readonly [number, number, number, number, number, number];
const attr = (element: LosslessXmlElement | undefined, name: string) => element?.attributes.find(a => a.namespaceUri === '' && a.localName === name)?.value;

/** Apply DrawingML flips in the local frame, then clockwise rotation about its centre, then offset. */
export function wordInkTransform(contentPart: LosslessXmlElement, drawing: WordDrawing, trace: InkBounds) {
  const xfrm = contentPart.children.find((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === contentPart.namespaceUri && child.localName === 'xfrm');
  const child = (name: string) => xfrm?.children.find((node): node is LosslessXmlElement => node.kind === 'element' && node.localName === name && ['http://schemas.openxmlformats.org/drawingml/2006/main', 'http://purl.oclc.org/ooxml/drawingml/main'].includes(node.namespaceUri ?? ''));
  const number = (element: LosslessXmlElement | undefined, name: string, fallback: number) => {
    const value = attr(element, name);
    if (value === undefined) return fallback;
    if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new RangeError(`Invalid ink transform ${name}.`);
    return Number(value);
  };
  const flip = (name: string) => {
    const value = attr(xfrm, name);
    if (value === undefined || value === 'false' || value === '0') return 1;
    if (value === 'true' || value === '1') return -1;
    throw new RangeError(`Invalid ink transform ${name}.`);
  };
  const width = number(child('ext'), 'cx', drawing.widthPoints * 12700) / 12700;
  const height = number(child('ext'), 'cy', drawing.heightPoints * 12700) / 12700;
  if (!(width > 0 && height > 0)) throw new RangeError('Ink transform extents must be positive.');
  const x = number(child('off'), 'x', 0) / 12700, y = number(child('off'), 'y', 0) / 12700;
  // Office stores even a point stroke in a nonzero frame (one HIMETRIC unit).
  // Its nib remains independent of that frame; scaling the frame scales the nib too.
  const sourceWidth = trace.width || 72 / 2540, sourceHeight = trace.height || 72 / 2540;
  const sx = width / sourceWidth, sy = height / sourceHeight;
  const angle = number(xfrm, 'rot', 0) / 60000 * Math.PI / 180;
  const c = Math.cos(angle), s = Math.sin(angle), fx = flip('flipH'), fy = flip('flipV');
  const a = c * fx * sx, b = s * fx * sx, cc = -s * fy * sy, d = c * fy * sy;
  const cx = trace.x + sourceWidth / 2, cy = trace.y + sourceHeight / 2;
  return [a, b, cc, d, x + width / 2 - a * cx - cc * cy, y + height / 2 - b * cx - d * cy] as const;
}
export function transformedInkBounds(bounds: InkBounds, [a, b, c, d, e, f]: InkMatrix): InkBounds {
  const corners = [bounds.x, bounds.x + bounds.width].flatMap(x => [bounds.y, bounds.y + bounds.height].map(y => ({ x: a * x + c * y + e, y: b * x + d * y + f })));
  const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
  return { x, y, width: Math.max(...corners.map(p => p.x)) - x, height: Math.max(...corners.map(p => p.y)) - y };
}
