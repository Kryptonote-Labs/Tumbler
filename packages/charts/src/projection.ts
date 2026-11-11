import type { ChartRect } from './layout.ts';
import type { SupportedChartModel } from './model.ts';

export interface ChartPoint3D { readonly x: number; readonly y: number; readonly z: number }

/** Project a unit plot box into the chart frame using the authored camera rotation. */
export function chartProjection(model: SupportedChartModel, plot: ChartRect) {
  const view = model.threeD;
  const yaw = (view?.rotationY ?? 20) * Math.PI / 180;
  const pitch = (view?.rotationX ?? 15) * Math.PI / 180;
  const depth = Math.max(0.01, (view?.depthPercent ?? 100) / 100) * 0.4;
  const perspective = view?.rightAngleAxes === false ? Math.tan(Math.min(120, Math.max(0, view.perspective)) * Math.PI / 360) : 0;
  const raw = (point: ChartPoint3D) => {
    const px = point.x - 0.5, py = point.y - 0.5, pz = (point.z - 0.5) * depth;
    const x = px * Math.cos(yaw) + pz * Math.sin(yaw);
    const z = -px * Math.sin(yaw) + pz * Math.cos(yaw);
    const y = py * Math.cos(pitch) - z * Math.sin(pitch);
    const cameraZ = py * Math.sin(pitch) + z * Math.cos(pitch);
    const factor = 1 / Math.max(0.05, 1 + cameraZ * perspective);
    return { x: x * factor, y: -y * factor, depth: cameraZ };
  };
  const corners = [0, 1].flatMap(x => [0, 1].flatMap(y => [0, 1].map(z => raw({ x, y, z }))));
  const minimumX = Math.min(...corners.map(point => point.x)), maximumX = Math.max(...corners.map(point => point.x));
  const minimumY = Math.min(...corners.map(point => point.y)), maximumY = Math.max(...corners.map(point => point.y));
  return (point: ChartPoint3D) => {
    const projected = raw(point);
    return { x: plot.x + (projected.x - minimumX) / (maximumX - minimumX || 1) * plot.width,
      y: plot.y + (projected.y - minimumY) / (maximumY - minimumY || 1) * plot.height, depth: projected.depth };
  };
}

export function chartPolygon(points: readonly { readonly x: number; readonly y: number }[]): string {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ') + ' Z';
}

export function chartShade(color: string, factor: number): string {
  if (!/^#[\da-f]{6}$/i.test(color)) return color;
  return '#' + [1, 3, 5].map(start => Math.round(Math.max(0, Math.min(255, parseInt(color.slice(start, start + 2), 16) * factor))).toString(16).padStart(2, '0')).join('');
}
