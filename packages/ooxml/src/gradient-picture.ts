import { drawingColorRgba } from './css-color.ts';
import { drawingGradientOffset, drawingGradientTile, drawingGradientTileFocus } from './gradient-geometry.ts';
import { drawingGradientStops } from './gradient-stops.ts';
import { encodeRgbaPng } from './png.ts';
import { linearGradientLine, type DrawingGradient } from './gradient.ts';
import type { DrawingCanvasPattern } from './pattern-fill.ts';
import type { DrawingPictureFill } from './picture-fill.ts';
export interface DrawingGradientRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

const brushes = new WeakMap<DrawingGradient, Map<string, DrawingPictureFill>>();
/** A complete nonlinear brush retains translucent coverage and supports elliptical highlights. */
export function drawingGradientPicture(gradient: DrawingGradient, bounds: DrawingGradientRect, coverage: DrawingGradientRect, scale = { x: 1, y: 1 }): DrawingPictureFill {
  let cache = brushes.get(gradient);
  if (!cache) { cache = new Map(); brushes.set(gradient, cache); }
  // Raster resolution is a paint budget, independent of the document's permitted dimensions.
  const width = Math.max(1, Math.min(1024, Math.ceil(coverage.width * scale.x))), height = Math.max(1, Math.min(1024, Math.ceil(coverage.height * scale.y)));
  const key = [width, height, bounds.x - coverage.x, bounds.y - coverage.y, bounds.width, bounds.height, coverage.width, coverage.height].join(',');
  const previous = cache.get(key);
  if (previous) return previous;
  const pixels = new Uint8Array(width * height * 4), stops = (drawingGradientStops(gradient).length ? drawingGradientStops(gradient) : [{ offset: 0, color: 'transparent' }]).map(stop => ({ ...stop, rgba: drawingColorRgba(stop.color) ?? [0, 0, 0, 0] as const }));
  const sample = drawingGradientOffset(gradient, bounds.width, bounds.height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = (coverage.x + (x + .5) * coverage.width / width - bounds.x);
    const py = (coverage.y + (y + .5) * coverage.height / height - bounds.y);
    const offset = sample(px, py);
    let low = 0, high = stops.length;
    while (low < high) { const middle = (low + high) >>> 1; if (stops[middle]!.offset > offset) high = middle; else low = middle + 1; }
    const end = low === stops.length ? -1 : low;
    const first = stops[Math.max(0, end < 0 ? stops.length - 1 : end - 1)]!, last = stops[end < 0 ? stops.length - 1 : end]!;
    const amount = first === last ? 0 : Math.max(0, Math.min(1, (offset - first.offset) / (last.offset - first.offset)));
    const alpha = first.rgba[3] * (1 - amount) + last.rgba[3] * amount, at = (y * width + x) * 4;
    for (const channel of [0, 1, 2]) pixels[at + channel] = alpha ? Math.round((first.rgba[channel]! * first.rgba[3] * (1 - amount) + last.rgba[channel]! * last.rgba[3] * amount) / alpha) : 0;
    pixels[at + 3] = Math.round(alpha * 255);
  }
  const picture: DrawingPictureFill = { bytes: encodeRgbaPng(width, height, pixels), contentType: 'image/png', crop: [0, 0, 0, 0], stretch: [0, 0, 0, 0] };
  cache.set(key, picture); return picture;
}


export interface DrawingGradientBrush {
  readonly picture: DrawingPictureFill;
  readonly transform: Parameters<DrawingCanvasPattern['setTransform']>[0];
}
const tiles = new WeakMap<DrawingGradient, DrawingGradient>();

/** Tile textures retain their authored frequency at any output scale, including subpixel periods. */
export function drawingGradientBrush(gradient: DrawingGradient, bounds: DrawingGradientRect, coverage: DrawingGradientRect, scale = { x: 1, y: 1 }): DrawingGradientBrush {
  const tile = drawingGradientTile(gradient);
  if (tile) {
    let shading = tiles.get(gradient);
    if (!shading) {
      const focus = drawingGradientTileFocus(gradient);
      shading = { kind: gradient.kind, angle: 0, scaled: false, center: focus.center, ...(focus.focusRect ? { focusRect: focus.focusRect } : {}), stops: gradient.stops, ...(gradient.kind === 'linear' ? { tileRect: [0, 0, .5, 1] as const } : {}) };
      tiles.set(gradient, shading);
    }
    const width = bounds.width * tile.width, height = bounds.height * tile.height;
    if (gradient.kind === 'linear') {
      const sample = { x: 0, y: 0, width: 512, height: 4 }, picture = drawingGradientPicture(shading, sample, sample);
      const [x1, y1, x2, y2] = linearGradientLine(gradient, width, height), dx = x2 - x1, dy = y2 - y1, length = Math.hypot(dx, dy) || 1;
      return { picture, transform: { a: dx / 256, b: dy / 256, c: -dy / length, d: dx / length, e: bounds.x + tile.x * bounds.width + x1, f: bounds.y + tile.y * bounds.height + y1 } };
    }
    const sample = { x: 0, y: 0, width: 256, height: 256 }, picture = drawingGradientPicture(shading, sample, sample);
    return { picture, transform: { a: width / 256, b: 0, c: 0, d: height / 256, e: bounds.x + tile.x * bounds.width, f: bounds.y + tile.y * bounds.height } };
  }
  const picture = drawingGradientPicture(gradient, bounds, coverage, scale);
  const width = Math.max(1, Math.min(1024, Math.ceil(coverage.width * scale.x))), height = Math.max(1, Math.min(1024, Math.ceil(coverage.height * scale.y)));
  return { picture, transform: { a: coverage.width / width, b: 0, c: 0, d: coverage.height / height, e: coverage.x, f: coverage.y } };
}
