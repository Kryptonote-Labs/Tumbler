import type { ChartAxis, SupportedChartModel } from './model.ts';
import { chartFont, type ChartFont } from './scene-style.ts';
import { layoutChartText } from './text-layout.ts';

export function chartAxisTitleSide(model: SupportedChartModel, axis: ChartAxis, xy = false) {
  const horizontal = xy ? axis.position === 'bottom' || axis.position === 'top' : model.kind === 'bar' ? axis.kind === 'value' : axis.kind === 'category';
  const high = axis.tickLabelPosition === 'high' || axis.tickLabelPosition !== 'low' && (axis.position === 'top' || axis.position === 'right');
  const side: ChartAxis['position'] = horizontal ? high ? 'top' : 'bottom' : high ? 'right' : 'left';
  return { horizontal, side };
}

export function chartAxisTitleRotation(model: SupportedChartModel, axis: ChartAxis, xy = false) {
  return axis.titleStyle?.rotation ?? (axis.kind === 'series' || chartAxisTitleSide(model, axis, xy).horizontal ? 0 : -90);
}

/** Reserve the fitted rich title, including its native orientation and painted frame. */
export function chartAxisTitleSpace(model: SupportedChartModel, measure: (text: string, font: ChartFont) => number, xy = false) {
  const space = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const axis of model.axes) {
    if (!axis.title || axis.titleLayout && (axis.titleLayout.x !== undefined || axis.titleLayout.y !== undefined) || axis.titleStyle?.rotation === undefined && !axis.titleText && !axis.titleShape) continue;
    const { horizontal, side } = chartAxisTitleSide(model, axis, xy);
    const fitted = layoutChartText({ model, measure, options: {} }, 'axisTitle', axis.titleStyle, axis.titleText?.length ? axis.titleText : [{ runs: [{ text: axis.title }] }]);
    const angle = chartAxisTitleRotation(model, axis, xy) * Math.PI / 180;
    const width = fitted.width + (axis.titleShape ? 6 : 0), height = fitted.height + (axis.titleShape ? 4 : 0);
    const extent = horizontal ? Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height : Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height;
    const topLabels = side === 'top' ? chartFont(axis.kind === 'category' ? 'category' : 'tick', axis.textStyle, model).size * 2.4 : 0;
    space[side] = Math.max(space[side], extent + topLabels + 8);
  }
  return space;
}
