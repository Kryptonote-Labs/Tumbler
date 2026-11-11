import type { DrawingGradient } from './gradient.ts';

/** Native rectangular/shape paths turn the four inset weights into a focal point. */
export function drawingGradientFocus(gradient: DrawingGradient) {
  if (!gradient.path || gradient.path === 'circle') return { center: gradient.center, ...(gradient.focusRect ? { focusRect: gradient.focusRect } : {}) };
  if (!gradient.focusRect) return { center: gradient.center };
  const [l, t, r, b] = gradient.focusRect;
  return { center: [l + 1 - r ? l / (l + 1 - r) : 0, t + 1 - b ? t / (t + 1 - b) : 0] as const };
}

/** Office circles shade once about the tile's centre, using a physical half-diagonal radius. */
export function drawingGradientCircle(gradient: DrawingGradient, width: number, height: number) {
  if (gradient.path !== 'circle') return;
  const [l, t, r, b] = gradient.tileRect ?? [0, 0, 1, 1];
  return { x: (l + r) * width / 2, y: (t + b) * height / 2, radius: Math.hypot((r - l) * width, (b - t) * height) / 2 };
}
