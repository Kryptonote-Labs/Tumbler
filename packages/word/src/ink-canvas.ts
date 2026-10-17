import { renderOfficeInkRaster } from '@tumblerjs/ink';
import type { WordLayoutFragment } from './layout.ts';

/** Structural ImageData interface implemented by browser and server canvases. */
export interface WordInkPixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  readonly colorSpace: 'srgb' | 'display-p3';
}
export interface WordInkPixelContext {
  getImageData?(x: number, y: number, width: number, height: number, settings?: { colorSpace: 'srgb' }): WordInkPixels;
  putImageData?(pixels: WordInkPixels, x: number, y: number): void;
}
/** Read the actual already-painted page pixels; ROP2 cannot be represented by an isolated image. */
export function paintWordInk(context: WordInkPixelContext, fragment: WordLayoutFragment, scale: number, maxPixels = 4_194_304): boolean {
  const drawing = fragment.drawing;
  if (!drawing?.ink || !drawing.inkProjection || !context.getImageData || !context.putImageData) return false;
  const { matrix, bounds, options } = drawing.inkProjection;
  if (!bounds.width || !bounds.height || !fragment.width || !fragment.height) return true;
  const x = Math.floor(fragment.x * scale), y = Math.floor(fragment.y * scale);
  const width = Math.ceil((fragment.x + fragment.width) * scale) - x;
  const height = Math.ceil((fragment.y + fragment.height) * scale) - y;
  if (!Number.isSafeInteger(width * height) || width * height > maxPixels) return false;
  const destination = context.getImageData(x, y, width, height, { colorSpace: 'srgb' });
  if (destination.colorSpace !== 'srgb') return false;
  const sx = fragment.width / bounds.width, sy = fragment.height / bounds.height;
  const [a, b, c, d, e, f] = matrix;
  const result = renderOfficeInkRaster(drawing.ink, {
    ...options, scale, maxPixels, destination: destination.data,
    transform: [a * sx, b * sy, c * sx, d * sy, (e - bounds.x) * sx + fragment.x - x / scale, (f - bounds.y) * sy + fragment.y - y / scale],
    bounds: { x: 0, y: 0, width: width / scale, height: height / scale },
  });
  if (!result.supported) return false;
  destination.data.set(result.data);
  context.putImageData(destination, x, y);
  return true;
}
