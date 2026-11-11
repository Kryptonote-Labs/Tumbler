import { drawingGradientBrush, drawingGradientTile, type DrawingGradient, type DrawingGradientRect } from '@tumblerjs/ooxml';
import type { SlideCanvasContext, SlideCanvasOptions } from './canvas-types.ts';

/** Bound a shape-local procedural brush to the visible slide, including rotated and flipped groups. */
export function slideObjectViewport(matrix: readonly number[], width: number, height: number, viewport: { readonly width: number; readonly height: number }): DrawingGradientRect {
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = matrix, determinant = a * d - b * c;
  if (!determinant) return { x: 0, y: 0, width: 0, height: 0 };
  const points = [[0, 0], [viewport.width, 0], [0, viewport.height], [viewport.width, viewport.height]].map(([x = 0, y = 0]) => [(d * (x - e) - c * (y - f)) / determinant, (a * (y - f) - b * (x - e)) / determinant] as const);
  const x = Math.max(0, Math.min(...points.map(p => p[0]))), y = Math.max(0, Math.min(...points.map(p => p[1])));
  return { x, y, width: Math.max(0, Math.min(width, Math.max(...points.map(p => p[0]))) - x), height: Math.max(0, Math.min(height, Math.max(...points.map(p => p[1]))) - y) };
}

export function slideGradientBrush(gradient: DrawingGradient | undefined, bounds: DrawingGradientRect, coverage: DrawingGradientRect, matrix: readonly number[] = [1, 0, 0, 1], outputScale = 1) {
  if (!gradient || gradient.kind !== 'rectangular' && !drawingGradientTile(gradient) || coverage.width <= 0 || coverage.height <= 0) return;
  return { bounds: coverage, ...drawingGradientBrush(gradient, bounds, coverage, { x: Math.hypot(matrix[0] ?? 1, matrix[1] ?? 0) * outputScale, y: Math.hypot(matrix[2] ?? 0, matrix[3] ?? 1) * outputScale }) };
}

/** Apply one complete brush to the current shape path; missing decoders use the vector fallback. */
export function paintSlideGradientBrush<Path, Image>(ctx: SlideCanvasContext<Path, Image>, brush: ReturnType<typeof slideGradientBrush>, options: SlideCanvasOptions<Path, Image>, path?: Path) {
  const decoded = brush && options.image?.(brush.picture), pattern = decoded && ctx.createPattern?.(decoded.image, 'repeat');
  if (!brush || !pattern) return false;
  pattern.setTransform(brush.transform);
  ctx.fillStyle = pattern; ctx.fill(path); return true;
}
