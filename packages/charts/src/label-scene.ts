import { mergeChartFillLayers } from './fill-style.ts';
import { chartGradientPaint } from './gradient-scene.ts';
import { chartStrokeMark } from './stroke-scene.ts';
import { chartStroke } from './scene-style.ts';
import type { ChartSeries } from './model.ts';
import type { ChartDataLabelOptions } from './data-labels.ts';
import { chartFont } from './scene-style.ts';
import { chartTickLabel } from './tick-label.ts';
import { chartPointColor } from './point-style.ts';
import { resolveChartColor } from './colors.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';

export interface ChartLabelPoint {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly baseX?: number;
  readonly baseY?: number;
  readonly category: string;
  readonly value: number;
  readonly percent?: number;
  readonly bubbleSize?: number;
}

/** Compose a label from its flags, preserving explicit point overrides and source number formats. */
export function chartDataLabelMarks(context: SceneContext, series: ChartSeries, seriesIndex: number, point: ChartLabelPoint): ChartMark[] {
  const plot = context.model.dataLabels, labels = series.dataLabels;
  if (!plot && !labels) return [];
  const settings = mergeChartFillLayers([plot, labels, plot?.points?.[point.index], labels?.points?.[point.index]]) ?? {};
  if (settings.deleted) return [];
  const fields = [
    settings.showSeries ? series.title ?? `Series ${seriesIndex + 1}` : undefined,
    settings.showCategory ? point.category : undefined,
    settings.showValue ? chartTickLabel(point.value, settings.formatCode ?? series.values?.formatCode, context.options) : undefined,
    settings.showPercent && point.percent !== undefined ? chartTickLabel(point.percent, settings.formatCode ?? '0%', context.options) : undefined,
    settings.showBubbleSize && point.bubbleSize !== undefined ? chartTickLabel(point.bubbleSize, settings.formatCode ?? series.bubbleSizes?.formatCode, context.options) : undefined,
  ].filter((value): value is string => value !== undefined);
  const text = settings.text ?? fields.join(settings.separator ?? '\n');
  if (!text && !settings.showLegendKey) return [];
  const font = chartFont('dataLabel', { ...plot?.textStyle, ...labels?.textStyle, ...settings.textStyle }, context.model, context.options.resolveColor);
  const lines = text.split('\n');
  let x = point.x, y = point.y - font.size * .5;
  let anchor: 'start' | 'end' | 'middle' = 'middle';
  const position = settings.position ?? 'bestFit';
  const horizontal = context.model.kind === 'bar';
  const dx = point.x - (point.baseX ?? point.x), dy = point.y - (point.baseY ?? point.y);
  if ((position === 'inEnd' || position === 'outEnd' || position === 'bestFit') && (dx || dy)) {
    const inside = position === 'inEnd';
    const direction = Math.sign(horizontal ? dx : dy);
    if (horizontal) { x += direction * (inside ? -6 : 6); anchor = (direction > 0) === inside ? 'end' : 'start'; y += font.size * .3; }
    else y += direction * (inside ? -1 : 1) * (font.size * .5 + 6) + font.size * .35;
  } else if (position === 'ctr' || position === 'inBase') {
    const factor = position === 'inBase' ? .15 : .5;
    x = (point.baseX ?? point.x) + dx * factor;
    y = (point.baseY ?? point.y) + dy * factor + font.size * .3;
  } else if (position === 'b') y += font.size * 1.8;
  else if (position === 'l') { x -= 6; anchor = 'end'; y += font.size * .8; }
  else if (position === 'r') { x += 6; anchor = 'start'; y += font.size * .8; }
  const width = Math.max(0, ...lines.map(line => context.measure(line, font))), height = font.size * 1.2 * lines.length;
  const left = x - (anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0);
  const top = y - font.size;
  const marks: ChartMark[] = [];
  const resolve = (color: NonNullable<ChartDataLabelOptions['fill']>) => context.options.resolveColor?.(color) ?? resolveChartColor(color, context.model);
  const stroke = settings.lineStyle ? chartStroke('axis', settings.lineStyle, context.model, context.options.resolveColor) : undefined;
  if (settings.fill || settings.gradient || stroke?.stroke) marks.push({ kind: 'rect', x: left - 3, y: top - 2, width: width + 6, height: height + 4, fill: settings.noFill ? 'none' : settings.fill ? resolve(settings.fill) ?? 'none' : 'none', ...chartGradientPaint(context, settings.noFill ? undefined : settings.gradient, { x: left - 3, y: top - 2, width: width + 6, height: height + 4 }), ...(stroke ? chartStrokeMark(stroke) : {}) });
  if (settings.showLegendKey) marks.push({ kind: 'rect', x: left - font.size - 4, y: top, width: font.size * .8, height: font.size * .8, fill: chartPointColor(context, series, seriesIndex, point.index) });
  lines.forEach((text, index) => marks.push({ kind: 'text', text, x, y: y + index * font.size * 1.2, anchor, font }));
  return marks;
}
