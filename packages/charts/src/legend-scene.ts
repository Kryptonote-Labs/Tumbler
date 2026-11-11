import { layoutChartLegend } from './legend-layout.ts';
import { chartLegendFill, chartPointFill } from './fill-scene.ts';
import { chartPointColor } from './point-style.ts';
import { chartStrokeMark } from './stroke-scene.ts';
import { chartStroke } from './scene-style.ts';
import { surfaceBandPaint } from './surface-bands.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';
import type { ChartLegendItem } from './legend-items.ts';

function key(context: SceneContext, entry: ChartLegendItem, x: number, y: number, size: number): ChartMark {
  if (entry.kind === 'trendline') {
    const color = entry.series.line ?? entry.series.fill ?? { kind: 'scheme' as const, value: `accent${entry.seriesIndex % 6 + 1}` };
    const stroke = chartStroke('axis', { color, width: 1.5, ...entry.trendline.lineStyle }, context.model, context.options.resolveColor);
    return { kind: 'line', x1: x, x2: x + size, y1: y - 3, y2: y - 3, ...chartStrokeMark(stroke), stroke: stroke.stroke ?? 'none', width: stroke.width };
  }
  const bounds = { x, y: y - size + 2, width: size, height: size };
  if (entry.kind === 'band') return { kind: 'rect', ...bounds, ...surfaceBandPaint(context, entry.bandIndex, context.model.bandFormats?.find(band => band.index === entry.bandIndex)?.style, bounds) };
  const fill = entry.kind === 'point' ? chartPointColor(context, entry.series, entry.seriesIndex, entry.pointIndex) : entry.series.noFill ? 'none' : context.color(entry.series, entry.seriesIndex);
  const paint = entry.kind === 'point' ? chartPointFill(context, entry.series, entry.pointIndex, bounds) : chartLegendFill(context, entry.series, bounds);
  return context.model.kind === 'bubble' ? { kind: 'circle', cx: x + size / 2, cy: y - size / 2 + 2, r: size / 2, ...paint, fill } : { kind: 'rect', ...bounds, ...paint, fill };
}

/** All chart families paint the same complete, measured legend list. */
export function chartLegendScene(context: SceneContext, bands?: readonly number[]): ChartMark[] {
  if (!context.model.legend) return [];
  const layout = layoutChartLegend(context.model, context.width, context.height, context.measure, bands, context.options.resolveColor, context.options);
  if (!layout.entries.length) return [];
  const size = layout.labelX >= 14 ? 10 : 8;
  return [{ kind: 'group', role: 'legend', marks: layout.entries.map(entry => ({ kind: 'group', role: 'legend-entry', marks: [
    key(context, entry, entry.x, entry.y, size),
    ...entry.lines.map((text, index): ChartMark => ({ kind: 'text', text, x: entry.x + layout.labelX, y: entry.y + index * entry.font.size * 1.2, anchor: 'start', font: entry.font })),
  ] })) }];
}
