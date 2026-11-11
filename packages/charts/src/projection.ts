import { layoutBarBand } from './bar-layout.ts';
import type { ChartWall } from './three-d-properties.ts';
import type { ChartRect } from './layout.ts';
import type { SupportedChartModel } from './model.ts';

/** With no authored depth, keep source grid cells and bar cross-sections proportional. */
function automaticDepth(model: SupportedChartModel, height: number): number {
  const count = Math.max(1, model.series.reduce((count, series) => Math.max(count, ...[series.categories, series.values].map(sequence => sequence?.points.reduce((count, point) => Math.max(count, point.index + 1), 0) ?? 0)), 0));
  const seriesCount = Math.max(1, model.series.length);
  if (model.kind === 'surface') return Math.max(1, seriesCount - 1) / Math.max(1, count - 1);
  const slots = model.grouping === 'standard' ? seriesCount : 1;
  if (model.kind !== 'bar' && model.kind !== 'column') return slots / count;
  const band = layoutBarBand(model.grouping === 'standard' ? { ...model, series: model.series.slice(0, 1) } : model, 1 / count);
  return band.thickness * slots * (1 + (model.gapDepth ?? 150) / 100) * (model.kind === 'bar' ? height : 1);
}

export interface ChartPoint3D { readonly x: number; readonly y: number; readonly z: number }

/** Physical dimensions relative to plot width, also used for wall thickness and lighting. */
export function chart3DSize(model: SupportedChartModel, plot: ChartRect) {
  const height = model.threeD?.heightPercent === undefined ? plot.height / Math.max(1, plot.width) : model.threeD.heightPercent / 100;
  const depth = Math.max(.0001, model.threeD?.depthPercent === undefined ? automaticDepth(model, height) : model.threeD.depthPercent / 100);
  return { width: 1, height, depth };
}

/** Project a unit plot box into the chart frame using the authored camera rotation. */
export function chartProjection(model: SupportedChartModel, plot: ChartRect) {
  const view = model.threeD;
  const yaw = (view?.rotationY ?? 20) * Math.PI / 180;
  const pitch = (view?.rotationX ?? 15) * Math.PI / 180;
  const { height: verticalSize, depth } = chart3DSize(model, plot);
  // MS-OI29500 2.1.1481/1451 bind height/depth to plot width; omitted height is automatic.
  const rotate = (point: ChartPoint3D) => {
    const px = point.x - 0.5, py = (point.y - 0.5) * verticalSize, pz = (point.z - 0.5) * depth;
    if (view?.rightAngleAxes !== false) return { x: px + pz * Math.sin(yaw), y: -py - pz * Math.sin(pitch), depth: -px * Math.sin(yaw) - py * Math.sin(pitch) + pz };
    const x = px * Math.cos(yaw) + pz * Math.sin(yaw);
    const z = -px * Math.sin(yaw) + pz * Math.cos(yaw);
    const y = py * Math.cos(pitch) + z * Math.sin(pitch);
    const cameraZ = -py * Math.sin(pitch) + z * Math.cos(pitch);
    return { x, y: -y, depth: cameraZ };
  };
  const thickness = (wall: ChartWall | undefined) => Math.max(0, wall?.thickness ?? 0) / 100 * Math.min(1, verticalSize);
  const farX = rotate({ x: 0, y: .5, z: .5 }).depth > rotate({ x: 1, y: .5, z: .5 }).depth ? 0 : 1;
  const farZ = rotate({ x: .5, y: .5, z: 0 }).depth > rotate({ x: .5, y: .5, z: 1 }).depth ? 0 : 1;
  const side = thickness(model.walls?.side), back = thickness(model.walls?.back) / depth, floor = thickness(model.walls?.floor) / verticalSize;
  const box = [farX ? 0 : -side, farX ? 1 + side : 1].flatMap(x => [-floor, 1].flatMap(y => [farZ ? 0 : -back, farZ ? 1 + back : 1].map(z => ({ x, y, z }))));
  // MS-OI29500 2.1.1516: Office stores twice the field-of-view angle; zero means 0.1°.
  const field = view?.perspective ? view.perspective / 2 : .1;
  const near = Math.max(0, ...box.map(point => -rotate(point).depth));
  const distance = near + Math.max(1, verticalSize) / (2 * Math.tan(field * Math.PI / 360));
  const raw = (point: ChartPoint3D) => {
    const projected = rotate(point), factor = view?.rightAngleAxes === false ? distance / (distance + projected.depth) : 1;
    return { x: projected.x * factor, y: projected.y * factor, depth: projected.depth };
  };
  const corners = box.map(raw);
  const minimumX = Math.min(...corners.map(point => point.x)), maximumX = Math.max(...corners.map(point => point.x));
  const minimumY = Math.min(...corners.map(point => point.y)), maximumY = Math.max(...corners.map(point => point.y));
  const scale = Math.min(plot.width / (maximumX - minimumX || 1), plot.height / (maximumY - minimumY || 1));
  return (point: ChartPoint3D) => {
    const projected = raw(point);
    return { x: plot.x + plot.width / 2 + (projected.x - (minimumX + maximumX) / 2) * scale,
      y: plot.y + plot.height / 2 + (projected.y - (minimumY + maximumY) / 2) * scale, depth: projected.depth };
  };
}

export function chartPolygon(points: readonly { readonly x: number; readonly y: number }[]): string {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ') + ' Z';
}

export function chartShade(color: string, factor: number): string {
  const rgba = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(color);
  const shade = (channel: number) => Math.round(Math.max(0, Math.min(255, channel * factor)));
  if (rgba) return `rgba(${rgba.slice(1, 4).map(channel => shade(Number(channel))).join(',')},${rgba[4]})`;
  if (!/^#[\da-f]{6}$/i.test(color)) return color;
  return '#' + [1, 3, 5].map(start => shade(parseInt(color.slice(start, start + 2), 16)).toString(16).padStart(2, '0')).join('');
}
