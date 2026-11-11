import { drawingColorRgba, encodeRgbaPng, type DrawingGradient, type DrawingPictureFill } from '@tumblerjs/ooxml';
import type { ChartMark } from './scene-marks.ts';
import type { ChartRect } from './layout.ts';

const brushes = new WeakMap<DrawingGradient, Map<string, DrawingPictureFill>>();
/** A complete rectangular brush avoids compositing separate antialiased faces on an outline. */
export function rectangularStrokeBrush(gradient: DrawingGradient, bounds: ChartRect, coverage: ChartRect): DrawingPictureFill {
  let cache = brushes.get(gradient);
  if (!cache) { cache = new Map(); brushes.set(gradient, cache); }
  const key = [bounds.x - coverage.x, bounds.y - coverage.y, bounds.width, bounds.height, coverage.width, coverage.height].join(',');
  const previous = cache.get(key);
  if (previous) return previous;
  const width = Math.max(1, Math.ceil(coverage.width)), height = Math.max(1, Math.ceil(coverage.height));
  const pixels = new Uint8Array(width * height * 4), stops = gradient.stops.map(stop => ({ ...stop, rgba: drawingColorRgba(stop.color) ?? [0, 0, 0, 0] as const }));
  const [l, t, r, b] = gradient.focusRect ?? [...gradient.center, ...gradient.center];
  const distance = (value: number, low: number, high: number) => value < low ? (low - value) / (low || 1e-12) : value > high ? (value - high) / (1 - high || 1e-12) : 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = (coverage.x + (x + .5) * coverage.width / width - bounds.x) / bounds.width;
    const py = (coverage.y + (y + .5) * coverage.height / height - bounds.y) / bounds.height;
    const offset = Math.max(0, Math.min(1, Math.max(distance(px, l, r), distance(py, t, b))));
    const end = stops.findIndex(stop => stop.offset > offset);
    const first = stops[Math.max(0, end < 0 ? stops.length - 1 : end - 1)]!, last = stops[end < 0 ? stops.length - 1 : end]!;
    const amount = first === last ? 0 : Math.max(0, Math.min(1, (offset - first.offset) / (last.offset - first.offset)));
    const alpha = first.rgba[3] * (1 - amount) + last.rgba[3] * amount, at = (y * width + x) * 4;
    for (const channel of [0, 1, 2]) pixels[at + channel] = alpha ? Math.round((first.rgba[channel]! * first.rgba[3] * (1 - amount) + last.rgba[channel]! * last.rgba[3] * amount) / alpha) : 0;
    pixels[at + 3] = Math.round(alpha * 255);
  }
  const picture: DrawingPictureFill = { bytes: encodeRgbaPng(width, height, pixels), contentType: 'image/png', crop: [0, 0, 0, 0], stretch: [0, 0, 0, 0] };
  cache.set(key, picture); return picture;
}

/** Procedural images are generated only when a canvas host requests them. SVG keeps vector paint. */
export function chartStrokeBrush(mark: Pick<ChartMark, 'strokeGradient' | 'strokeBounds' | 'strokeBrushBounds'>) {
  if (!mark.strokeGradient || !mark.strokeBounds || !mark.strokeBrushBounds) return;
  return { bounds: mark.strokeBrushBounds, picture: rectangularStrokeBrush(mark.strokeGradient, mark.strokeBounds, mark.strokeBrushBounds) };
}
