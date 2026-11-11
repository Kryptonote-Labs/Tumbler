import { linearGradientLine, type DrawingGradient } from './gradient.ts';

/** Native linear and rectangular shading use the authored tile, while circles shade only once. */
export function drawingGradientTile(gradient: DrawingGradient) {
  if (!gradient.tileRect || gradient.path === 'circle') return;
  const [l, t, r, b] = gradient.tileRect;
  if (r <= l || b <= t || l === 0 && t === 0 && r === 1 && b === 1) return;
  return { x: l, y: t, width: r - l, height: b - t };
}

const reflect = (value: number) => 1 - Math.abs(((value % 2 + 2) % 2) - 1);
const distance = (value: number, low: number, high: number) => value < low ? (low - value) / (low || 1e-12) : value > high ? (value - high) / (1 - high || 1e-12) : 0;

/** Sample one complete brush, so translucent face boundaries and tile edges composite only once. */
export function drawingGradientOffset(gradient: DrawingGradient, width: number, height: number) {
  const tile = drawingGradientTile(gradient), focus = drawingGradientTileFocus(gradient);
  const circle = drawingGradientCircle(gradient, width, height);
  const [l, t, r, b] = focus.focusRect ?? [...focus.center, ...focus.center];
  const [x1, y1, x2, y2] = linearGradientLine(gradient, width * (tile?.width ?? 1), height * (tile?.height ?? 1));
  const dx = x2 - x1, dy = y2 - y1, length = dx * dx + dy * dy;
  return (x: number, y: number) => {
    if (circle) return circle.radius > 0 ? Math.min(1, Math.hypot(x - circle.x, y - circle.y) / circle.radius) : 1;
    let px = x / width, py = y / height;
    if (tile) { px = (px - tile.x) / tile.width; py = (py - tile.y) / tile.height; if (gradient.kind !== 'linear') { px = (px % 1 + 1) % 1; py = (py % 1 + 1) % 1; } }
    const value = gradient.kind === 'linear' ? ((px * width * (tile?.width ?? 1) - x1) * dx + (py * height * (tile?.height ?? 1) - y1) * dy) / (length || 1)
      : gradient.kind === 'radial' ? Math.hypot(px - gradient.center[0], py - gradient.center[1]) * 2
      : Math.max(distance(px, l, r), distance(py, t, b));
    return tile && gradient.kind === 'linear' ? reflect(value) : Math.max(0, Math.min(1, value));
  };
}

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

/** Rectangular tile shading retains the focus position in the full shape's coordinate system. */
export function drawingGradientTileFocus(gradient: DrawingGradient) {
  const focus = drawingGradientFocus(gradient), tile = drawingGradientTile(gradient);
  if (!tile) return focus;
  const center = [(focus.center[0] - tile.x) / tile.width, (focus.center[1] - tile.y) / tile.height] as const;
  const rect = focus.focusRect;
  return { center, ...(rect ? { focusRect: [(rect[0] - tile.x) / tile.width, (rect[1] - tile.y) / tile.height, (rect[2] - tile.x) / tile.width, (rect[3] - tile.y) / tile.height] as const } : {}) };
}
