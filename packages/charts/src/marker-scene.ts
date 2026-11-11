import { mergeChartFillLayers } from './fill-style.ts';
import { chartGradientPaint, chartPointGradient } from './gradient-scene.ts';
import { chartStrokeMark } from './stroke-scene.ts';
import { chartStroke } from './scene-style.ts';
import { resolveChartColor } from './colors.ts';
import { chartPointColor } from './point-style.ts';
import type { ChartSeries } from './model.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';

/** One marker implementation is shared by categorical, XY and radar plots. */
export function chartMarkerMarks(context: SceneContext, series: ChartSeries, seriesIndex: number, index: number, x: number, y: number): ChartMark[] {
  const marker = mergeChartFillLayers([series.marker, context.pointFormat(series, index)?.marker]);
  if (marker?.symbol === 'none') return [];
  const nominalRadius = (marker?.size ?? 5) * 2 / 3;
  const radius = marker?.symbol === 'dot' ? Math.max(1, nominalRadius / 3) : nominalRadius;
  const resolve = (color: NonNullable<typeof marker>['fill']) => color && (context.options.resolveColor?.(color) ?? resolveChartColor(color, context.model));
  const fill = marker?.noFill ? 'none' : resolve(marker?.fill) ?? chartPointColor(context, series, seriesIndex, index);
  const inheritedStroke = chartPointColor(context, series, seriesIndex, index, true);
  const stroke = marker?.lineStyle?.noFill ? undefined : resolve(marker?.lineStyle?.color) ?? (inheritedStroke === 'none' ? fill : inheritedStroke);
  if (marker?.lineStyle?.noFill && ['plus', 'x', 'dash'].includes(marker.symbol ?? 'auto')) return [];
  const line = chartStroke('axis', marker?.lineStyle, context.model, context.options.resolveColor);
  const bounds = { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 };
  const gradient = marker?.gradient ? chartGradientPaint(context, marker.gradient, bounds) : marker?.noFill || marker?.fill ? {} : chartPointGradient(context, series, index, bounds);
  const outline = chartStrokeMark({ ...line, stroke });
  const style = { ...outline, fill, ...gradient };
  const polygon = (points: readonly [number, number][]) => [{ kind: 'path' as const, d: points.map(([dx, dy], i) => `${i ? 'L' : 'M'} ${x + dx} ${y + dy}`).join(' ') + ' Z', ...style }];
  switch (marker?.symbol ?? 'auto') {
    case 'square': return [{ kind: 'rect', x: x - radius, y: y - radius, width: radius * 2, height: radius * 2, ...style }];
    case 'diamond': return polygon([[0, -radius], [radius, 0], [0, radius], [-radius, 0]]);
    case 'triangle': return polygon([[0, -radius], [radius, radius], [-radius, radius]]);
    case 'star': return polygon(Array.from({ length: 10 }, (_, index) => { const angle = index * Math.PI / 5 - Math.PI / 2, length = index % 2 ? radius * .4 : radius; return [Math.cos(angle) * length, Math.sin(angle) * length]; }));
    case 'plus': return [{ kind: 'path', d: `M ${x - radius} ${y} L ${x + radius} ${y} M ${x} ${y - radius} L ${x} ${y + radius}`, ...outline, fill: 'none', stroke: stroke ?? fill }];
    case 'x': return [{ kind: 'path', d: `M ${x - radius} ${y - radius} L ${x + radius} ${y + radius} M ${x + radius} ${y - radius} L ${x - radius} ${y + radius}`, ...outline, fill: 'none', stroke: stroke ?? fill }];
    case 'dash': return [{ kind: 'path', d: `M ${x - radius} ${y} L ${x + radius} ${y}`, ...outline, fill: 'none', stroke: stroke ?? fill }];
    case 'dot': return [{ kind: 'circle', cx: x, cy: y, r: radius, ...style }];
    default: return [{ kind: 'circle', cx: x, cy: y, r: radius, ...style }];
  }
}
