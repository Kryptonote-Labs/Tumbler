import { applyInkRasterOperation } from './brush.ts';
import type { OfficeInkDocument, InkDiagnostic } from './document.ts';
import { createOfficeInkScene, type InkBounds, type InkShape, type InkSvgOptions } from './scene.ts';

export interface InkRasterOptions extends InkSvgOptions {
  /** Raster pixels per physical point. */
  readonly scale?: number;
  /** Image rectangle in physical points; defaults to the ink's painted bounds. */
  readonly bounds?: InkBounds;
  /** Existing destination RGBA pixels. Never modified. Required for destination-dependent operations. */
  readonly destination?: Uint8Array | Uint8ClampedArray;
  /** An explicit opaque destination colour when no pixel backdrop is supplied. */
  readonly background?: readonly [number, number, number];
  readonly maxPixels?: number;
  /** Affine transform from physical ink points to the raster's point coordinate system. */
  readonly transform?: readonly [number, number, number, number, number, number];
}
export type InkRasterResult =
  | { readonly supported: true; readonly width: number; readonly height: number; readonly data: Uint8ClampedArray; readonly bounds: InkBounds }
  | { readonly supported: false; readonly diagnostics: readonly InkDiagnostic[] };

/** Raster composition applies each stroke once, after unioning its nib coverage.
 * Bitwise Office operations use the caller's destination, then coverage and transparency
 * interpolate that result. This avoids inventing a white background for a highlighter.
 */
export function renderOfficeInkRaster(document: OfficeInkDocument, options: InkRasterOptions = {}): InkRasterResult {
  const scene = createOfficeInkScene(document, options);
  if (!scene.supported) return scene;
  const scale = options.scale ?? 4 / 3;
  const matrix = options.transform ?? [1, 0, 0, 1, 0, 0];
  const [a, b, c, d, e, f] = matrix, determinant = a * d - b * c;
  if (!matrix.every(Number.isFinite) || !Number.isFinite(determinant) || !determinant) throw new RangeError('Invalid ink raster transform.');
  const mapBounds = (box: InkBounds): InkBounds => {
    const x = a * (box.x + box.width / 2) + c * (box.y + box.height / 2) + e;
    const y = b * (box.x + box.width / 2) + d * (box.y + box.height / 2) + f;
    const width = Math.abs(a) * box.width + Math.abs(c) * box.height;
    const height = Math.abs(b) * box.width + Math.abs(d) * box.height;
    return { x: x - width / 2, y: y - height / 2, width, height };
  };
  const transformed = mapBounds(scene.bounds);
  const bounds = options.bounds ?? { ...transformed, width: transformed.width || 1 / scale, height: transformed.height || 1 / scale };
  if (!(scale > 0) || !Number.isFinite(scale) || !Object.values(bounds).every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) throw new RangeError('Invalid ink raster dimensions.');
  const width = Math.ceil(bounds.width * scale), height = Math.ceil(bounds.height * scale);
  const maxPixels = options.maxPixels ?? 4_194_304;
  if (!(maxPixels >= 0) || (maxPixels !== Infinity && !Number.isSafeInteger(maxPixels))) throw new RangeError('Invalid ink raster budget.');
  if (!Number.isSafeInteger(width * height) || width * height > maxPixels) return { supported: false, diagnostics: [{ elementId: document.source.root.id, code: 'resource', message: 'Ink raster exceeds the configured pixel budget.' }] };
  if (options.destination && options.destination.length !== width * height * 4) throw new RangeError('Destination dimensions do not match ink raster.');
  const needsDestination = scene.strokes.find(s => !['copyPen', 'noOperation', 'black', 'white', 'notCopyPen'].includes(s.brush.rasterOp));
  if (needsDestination && !options.destination && !options.background) return { supported: false, diagnostics: [{ elementId: needsDestination.elementId, code: 'rendering', message: 'This ink requires destination pixels or an explicit background colour.' }] };
  const data = options.destination ? new Uint8ClampedArray(options.destination) : new Uint8ClampedArray(width * height * 4);
  if (!options.destination && options.background) {
    if (options.background.some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new RangeError('Invalid background colour.');
    for (let pixel = 0; pixel < width * height; pixel++) data.set([...options.background, 255], pixel * 4);
  }
  for (const { shapes, brush } of scene.strokes) {
    if (!shapes.length || brush.rasterOp === 'noOperation' || brush.transparency === 255) continue;
    const samples = brush.antiAliased ? 4 : 1;
    const coverage = new Uint16Array(width * height);
    for (const shape of shapes) {
      const box = mapBounds(shapeBounds(shape));
      const left = Math.max(0, Math.floor((box.x - bounds.x) * scale)), right = Math.min(width, Math.ceil((box.x + box.width - bounds.x) * scale));
      const top = Math.max(0, Math.floor((box.y - bounds.y) * scale)), bottom = Math.min(height, Math.ceil((box.y + box.height - bounds.y) * scale));
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const pixel = y * width + x;
        for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
          const bit = 1 << (sy * samples + sx);
          const px = bounds.x + (x + (sx + 0.5) / samples) / scale - e;
          const py = bounds.y + (y + (sy + 0.5) / samples) / scale - f;
          if (!(coverage[pixel]! & bit) && contains(shape, (d * px - c * py) / determinant, (a * py - b * px) / determinant)) coverage[pixel] = coverage[pixel]! | bit;
        }
      }
    }
    const pen = Number.parseInt(brush.color.slice(1), 16);
    for (let pixel = 0; pixel < width * height; pixel++) {
      let bits = coverage[pixel]!, count = 0;
      while (bits) { bits &= bits - 1; count++; }
      if (!count) continue;
      const offset = pixel * 4;
      const alpha = count / (samples * samples) * (1 - brush.transparency / 255);
      const destination = (data[offset]! << 16) | (data[offset + 1]! << 8) | data[offset + 2]!;
      const color = applyInkRasterOperation(brush.rasterOp, pen, destination);
      const oldAlpha = data[offset + 3]! / 255, newAlpha = alpha + oldAlpha * (1 - alpha);
      for (let channel = 0; channel < 3; channel++) data[offset + channel] = (((color >> (16 - channel * 8)) & 255) * alpha + data[offset + channel]! * oldAlpha * (1 - alpha)) / newAlpha;
      data[offset + 3] = newAlpha * 255;
    }
  }
  return { supported: true, width, height, data, bounds };
}
function shapeBounds(shape: InkShape): InkBounds {
  if (shape.kind === 'ellipse') {
    const dx = Math.hypot(shape.rx * Math.cos(shape.angle), shape.ry * Math.sin(shape.angle));
    const dy = Math.hypot(shape.rx * Math.sin(shape.angle), shape.ry * Math.cos(shape.angle));
    return { x: shape.x - dx, y: shape.y - dy, width: 2 * dx, height: 2 * dy };
  }
  const xs = shape.points.map(p => p.x), ys = shape.points.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
function contains(shape: InkShape, x: number, y: number) {
  if (shape.kind === 'ellipse') {
    if (!shape.rx || !shape.ry) return false;
    const dx = x - shape.x, dy = y - shape.y, c = Math.cos(shape.angle), s = Math.sin(shape.angle);
    return ((c * dx + s * dy) / shape.rx) ** 2 + ((c * dy - s * dx) / shape.ry) ** 2 <= 1;
  }
  let inside = false;
  for (let i = 0, j = shape.points.length - 1; i < shape.points.length; j = i++) {
    const a = shape.points[i]!, b = shape.points[j]!;
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
