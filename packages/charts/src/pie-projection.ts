import type { ChartRect } from './layout.ts';
import type { ChartView3D } from './three-d-properties.ts';

/** Project a diameter-one pie cylinder, fitting its box to the authored plot frame. */
export function pieProjection(view: ChartView3D, plot: ChartRect, footprint: readonly { readonly x: number; readonly y: number }[] = []) {
  const pitch = Math.max(0, Math.min(90, view.rotationX)) * Math.PI / 180;
  const sin = Math.sin(pitch), cos = Math.cos(pitch);
  // LibreOffice's native chart camera maps perspective linearly in inverse distance.
  // Its endpoints are 20 and 0.75 plot diameters. Pie views ignore right-angle axes.
  const box = [-.5, .5].flatMap(x => [-.5, .5].map(y => ({ x, y })));
  const volume = [...box, ...footprint].flatMap(point => [-.05, .05].map(z => ({ ...point, z })));
  const authoredInverse = 1 / 20 + (1 / .75 - 1 / 20) * Math.max(0, Math.min(200, view.perspective)) / 200;
  // Move back as explosion extends the volume, keeping the same near clearance.
  const near = volume.reduce((maximum, point) => Math.max(maximum, point.y * cos + point.z * sin), -Infinity);
  const distance = 1 / authoredInverse + Math.max(0, near - (.5 * cos + .05 * sin));
  const inverseDistance = view.perspective === 0 ? 0 : 1 / distance;
  const raw = (x: number, y: number, z: number) => {
    const factor = 1 / (1 - (y * cos + z * sin) * inverseDistance);
    return { x: x * factor, y: (y * sin - z * cos) * factor };
  };
  // Pie thickness is independent of the Cartesian height/depth percentages.
  const corners = volume.map(point => raw(point.x, point.y, point.z));
  const { minX, maxX, minY, maxY } = corners.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x), maxX: Math.max(bounds.maxX, point.x),
    minY: Math.min(bounds.minY, point.y), maxY: Math.max(bounds.maxY, point.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const scale = Math.max(0, Math.min(plot.width / (maxX - minX), plot.height / (maxY - minY)));
  const cx = plot.x + plot.width / 2 - (minX + maxX) / 2 * scale;
  const cy = plot.y + plot.height / 2 - (minY + maxY) / 2 * scale;
  const project = (x: number, y: number, z = .05) => {
    const point = raw(x, y, z);
    return { x: cx + point.x * scale, y: cy + point.y * scale };
  };
  const unproject = (x: number, y: number) => {
    if (!scale) return undefined;
    const screenY = (y - cy) / scale;
    const denominator = sin + screenY * cos * inverseDistance;
    if (Math.abs(denominator) < 1e-12) return undefined;
    const planeY = (screenY * (1 - .05 * sin * inverseDistance) + .05 * cos) / denominator;
    const factor = 1 - (planeY * cos + .05 * sin) * inverseDistance;
    return { x: (x - cx) / scale * factor, y: planeY };
  };
  return { project, unproject, scale };
}
