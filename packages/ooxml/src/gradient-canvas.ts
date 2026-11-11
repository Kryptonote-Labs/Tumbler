import { drawingGradientStops } from './gradient-stops.ts';
import { linearGradientLine, rectangularGradientFaces, type DrawingGradient } from './gradient.ts';
export interface DrawingGradientCanvasContext {
  fillStyle: unknown;
  save():void; restore():void; scale(x:number,y:number):void;
  createLinearGradient(x0:number,y0:number,x1:number,y1:number): { addColorStop(offset:number,color:string):void };
  createRadialGradient(x0:number,y0:number,r0:number,x1:number,y1:number,r1:number): { addColorStop(offset:number,color:string):void };
  beginPath():void; moveTo(x:number,y:number):void; lineTo(x:number,y:number):void; fill():void;
}
export function paintDrawingGradient(
  ctx: DrawingGradientCanvasContext,
  value: DrawingGradient | undefined,
  fallback: string,
  w: number,
  h: number,
) {
  if (!value) return fallback;
  let result;
  if (value.kind === 'radial') {
    ctx.save();
    ctx.scale(w, h);
    result = ctx.createRadialGradient(value.center[0], value.center[1], 0, value.center[0], value.center[1], 0.5);
    ctx.restore();
  } else result = ctx.createLinearGradient(...linearGradientLine(value, w, h));
  for (const stop of drawingGradientStops(value))
    result.addColorStop(Math.max(0, Math.min(1, stop.offset)), stop.color);
  return result;
}
/**
 * Canvas has no rectangular paint either; paint the shaded faces into the current clip. Opaque
 * faces overlap to hide anti-aliased seams. Translucent faces stay exact: overlapping would darken
 * the diagonals, so they keep a faint anti-aliasing hairline that only an offscreen layer avoids.
 */
export function paintRectangularGradient(
  ctx: DrawingGradientCanvasContext,
  value: DrawingGradient,
  w: number,
  h: number,
) {
  const opaque = value.stops.every(({ color }) => {
    const alpha = /^rgba\(.*,\s*([\d.]+)\)$/.exec(color)?.[1];
    return color !== 'transparent' && (alpha === undefined || Number(alpha) >= 1);
  });
  const [l, t, r, b] = value.focusRect ?? [...value.center, ...value.center];
  if (r > l && b > t) {
    ctx.fillStyle = value.stops[0]?.color ?? 'transparent';
    ctx.beginPath();
    ctx.moveTo(l * w, t * h); ctx.lineTo(r * w, t * h); ctx.lineTo(r * w, b * h); ctx.lineTo(l * w, b * h);
    ctx.fill();
  }
  for (const face of rectangularGradientFaces(value.center, opaque ? 1 / Math.max(1, Math.min(w, h)) : 0, value.focusRect)) {
    const [x1, y1, x2, y2] = face.line;
    const fill = ctx.createLinearGradient(x1 * w, y1 * h, x2 * w, y2 * h);
    for (const stop of drawingGradientStops(value))
      fill.addColorStop(Math.max(0, Math.min(1, stop.offset)), stop.color);
    ctx.fillStyle = fill;
    ctx.beginPath();
    face.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
    ctx.fill();
  }
}
