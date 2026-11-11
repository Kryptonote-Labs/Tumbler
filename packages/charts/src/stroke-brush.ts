import { drawingGradientBrush } from '@tumblerjs/ooxml';
import type { ChartMark } from './scene-marks.ts';

/** Procedural images are generated only when a canvas host requests them. SVG keeps vector paint. */
export function chartStrokeBrush(mark: Pick<ChartMark, 'strokeGradient' | 'strokeBounds' | 'strokeBrushBounds'>) {
  if (!mark.strokeGradient || !mark.strokeBounds || !mark.strokeBrushBounds) return;
  return { bounds: mark.strokeBrushBounds, ...drawingGradientBrush(mark.strokeGradient, mark.strokeBounds, mark.strokeBrushBounds) };
}
