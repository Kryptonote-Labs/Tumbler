import { resolveChartColor } from './colors.ts';
import { chartPointColor } from './point-style.ts';
import type { ChartSeries } from './model.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';

/** One marker implementation is shared by categorical, XY and radar plots. */
export function chartMarkerMarks(context: SceneContext, series: ChartSeries, seriesIndex: number, index: number, x: number, y: number): ChartMark[] {
  const marker = context.pointFormat(series, index)?.marker ?? series.marker;
  if (marker?.symbol === 'none') return [];
  const radius = (marker?.size ?? 5) * 2 / 3;
  const resolve = (color: NonNullable<typeof marker>['fill']) => color && (context.options.resolveColor?.(color) ?? resolveChartColor(color, context.model));
  const fill = marker?.noFill ? 'none' : resolve(marker?.fill) ?? chartPointColor(context, series, seriesIndex, index);
  const stroke = marker?.lineStyle?.noFill ? undefined : resolve(marker?.lineStyle?.color);
  const style = { fill, ...(stroke ? { stroke } : {}), ...(marker?.lineStyle?.width === undefined ? {} : { strokeWidth: marker.lineStyle.width * 4 / 3 }) };
  const polygon = (points: readonly [number, number][]) => [{ kind: 'path' as const, d: points.map(([dx, dy], i) => `${i ? 'L' : 'M'} ${x + dx} ${y + dy}`).join(' ') + ' Z', ...style }];
  switch (marker?.symbol ?? 'auto') {
    case 'square': return [{ kind: 'rect', x: x - radius, y: y - radius, width: radius * 2, height: radius * 2, ...style }];
    case 'diamond': return polygon([[0, -radius], [radius, 0], [0, radius], [-radius, 0]]);
    case 'triangle': return polygon([[0, -radius], [radius, radius], [-radius, radius]]);
    case 'star': return polygon(Array.from({ length: 10 }, (_, index) => { const angle = index * Math.PI / 5 - Math.PI / 2, length = index % 2 ? radius * .4 : radius; return [Math.cos(angle) * length, Math.sin(angle) * length]; }));
    case 'plus': return [{ kind: 'path', d: `M ${x - radius} ${y} L ${x + radius} ${y} M ${x} ${y - radius} L ${x} ${y + radius}`, stroke: stroke ?? fill, strokeWidth: style.strokeWidth ?? 1.5 }];
    case 'x': return [{ kind: 'path', d: `M ${x - radius} ${y - radius} L ${x + radius} ${y + radius} M ${x + radius} ${y - radius} L ${x - radius} ${y + radius}`, stroke: stroke ?? fill, strokeWidth: style.strokeWidth ?? 1.5 }];
    case 'dash': return [{ kind: 'path', d: `M ${x - radius} ${y} L ${x + radius} ${y}`, stroke: stroke ?? fill, strokeWidth: style.strokeWidth ?? 1.5 }];
    case 'dot': return [{ kind: 'circle', cx: x, cy: y, r: Math.max(1, radius / 3), ...style }];
    default: return [{ kind: 'circle', cx: x, cy: y, r: radius, ...style }];
  }
}
