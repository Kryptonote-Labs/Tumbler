import { renderOfficeInkRaster } from '@tumblerjs/ink';
import type { WordLayoutFragment } from './layout.ts';
import { wordImagePaintBounds } from './image-paint.ts';

/** Structural ImageData interface implemented by browser and server canvases. */
export interface WordInkPixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  /** Older/server canvases omit this metadata and use sRGB. */
  readonly colorSpace?: 'srgb' | 'display-p3';
}
export interface WordInkPixelContext {
  getImageData?(x: number, y: number, width: number, height: number): WordInkPixels;
  putImageData?(pixels: WordInkPixels, x: number, y: number): void;
}
export interface WordInkViewport { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }

/** Read the actual already-painted page pixels; ROP2 cannot be represented by an isolated image. */
export function paintWordInk(context: WordInkPixelContext, fragment: WordLayoutFragment, scale: number, maxPixels = 4_194_304, viewport?: WordInkViewport): boolean {
  const drawing = fragment.drawing;
  if (drawing?.kind !== 'image' || !drawing.ink || !drawing.inkProjection || !context.getImageData || !context.putImageData) return false;
  const { bounds, options } = drawing.inkProjection;
  if (!bounds.width || !bounds.height || !fragment.width || !fragment.height) return true;
  const box = wordImagePaintBounds(drawing, fragment.width, fragment.height);
  const left = fragment.x + box.x, top = fragment.y + box.y;
  const originX = viewport?.x ?? 0, originY = viewport?.y ?? 0;
  const x = Math.max(viewport ? 0 : -Infinity, Math.floor(left * scale) - originX);
  const y = Math.max(viewport ? 0 : -Infinity, Math.floor(top * scale) - originY);
  const width = Math.min(viewport?.width ?? Infinity, Math.ceil((left + box.width) * scale) - originX) - x;
  const height = Math.min(viewport?.height ?? Infinity, Math.ceil((top + box.height) * scale) - originY) - y;
  if (width <= 0 || height <= 0) return true;
  if (!Number.isSafeInteger(width * height) || width * height > maxPixels) return false;
  // The four-argument form is shared by browser and server canvases. Their
  // optional colour-space arguments differ; validate the returned pixels instead.
  const destination = context.getImageData(x, y, width, height);
  if (destination.colorSpace !== undefined && destination.colorSpace !== 'srgb') return false;
  const sx = fragment.width / drawing.widthPoints, sy = fragment.height / drawing.heightPoints;
  const result = renderOfficeInkRaster(drawing.ink, {
    ...options, scale, maxPixels, destination: destination.data,
    transform: [sx, 0, 0, sy, fragment.x - (x + originX) / scale, fragment.y - (y + originY) / scale],
    bounds: { x: 0, y: 0, width: width / scale, height: height / scale },
  });
  if (!result.supported) return false;
  destination.data.set(result.data);
  context.putImageData(destination, x, y);
  return true;
}
