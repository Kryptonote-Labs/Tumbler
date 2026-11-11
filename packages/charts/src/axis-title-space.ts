import type { ChartAxis, SupportedChartModel } from './model.ts';
import { chartFont, type ChartFont } from './scene-style.ts';

export function chartAxisTitleSide(model: SupportedChartModel, axis: ChartAxis, xy = false) {
  const horizontal = xy ? axis.position === 'bottom' || axis.position === 'top' : model.kind === 'bar' ? axis.kind === 'value' : axis.kind === 'category';
  const high = axis.tickLabelPosition === 'high' || axis.tickLabelPosition !== 'low' && (axis.position === 'top' || axis.position === 'right');
  const side: ChartAxis['position'] = horizontal ? high ? 'top' : 'bottom' : high ? 'right' : 'left';
  return { horizontal, side };
}

/** Explicit axis-title rotation can need more room than the automatic vertical title. */
export function chartAxisTitleSpace(model: SupportedChartModel, measure: (text: string, font: ChartFont) => number, xy = false) {
  const space = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const axis of model.axes) {
    if (axis.deleted || !axis.title || axis.titleLayout && (axis.titleLayout.x !== undefined || axis.titleLayout.y !== undefined) || axis.titleStyle?.rotation === undefined) continue;
    const { horizontal, side } = chartAxisTitleSide(model, axis, xy);
    const font = chartFont('axisTitle', axis.titleStyle, model), angle = axis.titleStyle.rotation * Math.PI / 180;
    const width = measure(axis.title, font), height = font.size * 1.2;
    const extent = horizontal ? Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height : Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height;
    const topLabels = side === 'top' ? chartFont(axis.kind === 'category' ? 'category' : 'tick', axis.textStyle, model).size * 2.4 : 0;
    space[side] = Math.max(space[side], extent + topLabels + 8);
  }
  return space;
}
