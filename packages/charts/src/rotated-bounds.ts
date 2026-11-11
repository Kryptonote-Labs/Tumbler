import type { ChartRect } from './layout.ts';
import type { ChartRotation } from './scene-marks.ts';

/** Axis-aligned coverage of a rectangle rotated in the containing scene. */
export function rotatedChartBounds(rect: ChartRect, rotation: ChartRotation): ChartRect {
  const angle = rotation.angle * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const points = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }].map(({ x, y }) => ({
    x: rotation.cx + (x - rotation.cx) * cos - (y - rotation.cy) * sin,
    y: rotation.cy + (x - rotation.cx) * sin + (y - rotation.cy) * cos,
  }));
  const x = Math.min(...points.map(point => point.x)), y = Math.min(...points.map(point => point.y));
  return { x, y, width: Math.max(...points.map(point => point.x)) - x, height: Math.max(...points.map(point => point.y)) - y };
}
