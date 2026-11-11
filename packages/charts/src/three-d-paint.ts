import { chartMeshNormal } from './bar-mesh.ts';
import { chartPointColor } from './point-style.ts';
import { chartPointGradient } from './gradient-scene.ts';
import { chartPointStroke } from './stroke-scene.ts';
import { chart3DSize, chartShade, type ChartPoint3D } from './projection.ts';
import type { ChartSeries } from './model.ts';
import type { ChartRect } from './layout.ts';
import type { SceneContext } from './scene-marks.ts';

/** One paint choice is shared by a bar's faces; lighting modulates colour without dropping alpha. */
export function threeDPointPaint(context: SceneContext, series: ChartSeries, seriesIndex: number, index: number, vertices: readonly ChartPoint3D[], bounds: ChartRect, line: boolean, size: ReturnType<typeof chart3DSize>) {
  const normal = chartMeshNormal(vertices.map(point => ({ x: point.x, y: point.y * size.height, z: point.z * size.depth }))), fill = chartPointColor(context, series, seriesIndex, index, line);
  const light = normal ? Math.max(.45, Math.min(1.2, .8 + normal.y * .35 - normal.z * .15 - normal.x * .1)) : 1;
  const gradient = line ? {} : chartPointGradient(context, series, index, bounds);
  return { fill: chartShade(fill, light), ...gradient, ...(gradient.fillGradient ? { fillGradient: { ...gradient.fillGradient, gradient: { ...gradient.fillGradient.gradient, stops: gradient.fillGradient.gradient.stops.map(stop => ({ ...stop, color: chartShade(stop.color, light) })) } } } : {}), ...chartPointStroke(context, series, seriesIndex, index) };
}
