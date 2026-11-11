import { chartPointColor } from './point-style.ts';
import { chartPointGradient } from './gradient-scene.ts';
import { chartShade } from './projection.ts';
import type { ChartRect } from './layout.ts';
import type { ChartSeries } from './model.ts';
import type { SceneContext } from './scene-marks.ts';

function highlight(color: string): string {
  const channels = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  const rgba = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(color);
  const blend = (value: number) => Math.round(value + (255 - value) * .65);
  if (channels) return '#' + channels.slice(1).map(channel => blend(parseInt(channel, 16)).toString(16).padStart(2, '0')).join('');
  if (rgba) return `rgba(${rgba.slice(1, 4).map(channel => blend(Number(channel))).join(',')},${rgba[4]})`;
  return color;
}

/** A 3D bubble is a shaded sphere in the same XY geometry; explicit fills retain precedence. */
export function chartBubblePaint(context: SceneContext, series: ChartSeries, seriesIndex: number, point: number, bounds: ChartRect) {
  const fill = chartPointColor(context, series, seriesIndex, point), authored = chartPointGradient(context, series, point, bounds);
  if (!(context.pointFormat(series, point)?.bubble3D ?? series.bubble3D ?? context.model.bubble3D) || fill === 'none' || authored.fillGradient) return { fill, ...authored };
  return { fill, fillGradient: { bounds, gradient: { kind: 'radial' as const, angle: 0, scaled: true, center: [.3, .25] as const, stops: [
    { offset: 0, color: highlight(fill) }, { offset: .4, color: fill }, { offset: 1, color: chartShade(fill, .5) },
  ] } } };
}
