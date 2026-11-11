import { drawingGradientStops, paintDrawingGradient, paintRectangularGradient, type DrawingGradientCanvasContext } from '@tumblerjs/ooxml';
import type { ChartCanvasContext } from './canvas.ts';
import type { ChartGradientPaint } from './gradient-scene.ts';

/** Paint into the caller's current shape clip; the caller restores its path before stroking. */
export function paintChartGradient<Path>(context: ChartCanvasContext<Path>, paint: ChartGradientPaint, shape?: Path): void {
  const { bounds, gradient } = paint;
  if (!(bounds.width > 0 && bounds.height > 0)) return;
  if (!supportsGradients(context)) {
    context.fillStyle = gradient.stops[0]?.color ?? 'transparent';
    context.fill(shape);
    return;
  }
  context.save();
  context.clip(shape);
  context.translate(bounds.x, bounds.y);
  if (gradient.kind === 'rectangular') paintRectangularGradient(context, gradient, bounds.width, bounds.height);
  else if (gradient.kind === 'radial') {
    context.scale(bounds.width, bounds.height);
    const fill = context.createRadialGradient(...gradient.center, 0, ...gradient.center, .5);
    for (const stop of drawingGradientStops(gradient)) fill.addColorStop(stop.offset, stop.color);
    context.fillStyle = fill;
    context.beginPath();
    context.rect(0, 0, 1, 1);
    context.fill();
  } else {
    context.fillStyle = paintDrawingGradient(context, gradient, 'transparent', bounds.width, bounds.height);
    context.beginPath();
    context.rect(0, 0, bounds.width, bounds.height);
    context.fill();
  }
  context.restore();
}

function supportsGradients<Path>(context: ChartCanvasContext<Path>): context is ChartCanvasContext<Path> & DrawingGradientCanvasContext {
  return !!context.scale && !!context.createLinearGradient && !!context.createRadialGradient;
}

/** Shade the existing outline without changing its dash, caps or joins. */
export function paintChartGradientStroke<Path>(context: ChartCanvasContext<Path>, paint: ChartGradientPaint, draw: () => void): void {
  const { gradient, bounds } = paint;
  if (!supportsGradients(context) || bounds.width <= 0 || bounds.height <= 0) {
    context.strokeStyle = gradient.stops[0]?.color ?? 'transparent'; draw(); return;
  }
  if (gradient.kind !== 'rectangular') {
    context.save();
    context.translate(bounds.x, bounds.y);
    const brush = paintDrawingGradient(context, gradient, 'transparent', bounds.width, bounds.height);
    context.restore();
    context.strokeStyle = brush; draw(); return;
  }
  // Hosts without procedural-image decoding retain a visible outline.
  context.strokeStyle = gradient.stops[0]?.color ?? 'transparent'; draw();
}
