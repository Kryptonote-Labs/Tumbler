import { chartAxisCoordinate } from './axis-scale.ts';
import type { ScatterChartLayout } from './layout.ts';
import type { SupportedChartModel } from './model.ts';

export function xyGeometry(model: SupportedChartModel, layout: ScatterChartLayout) {
  const axis = (index: number) => model.axisIds?.[index] === undefined ? model.axes.filter(axis => axis.kind === 'value')[index] : model.axes.find(axis => axis.id === model.axisIds![index]);
  const xAxis = axis(0), yAxis = axis(1);
  const x = (value: number) => chartAxisCoordinate(value, layout.xMinimum, layout.xMaximum, layout.plot.x, layout.plot.width, xAxis);
  const y = (value: number) => chartAxisCoordinate(value, layout.yMinimum, layout.yMaximum, layout.plot.y, layout.plot.height, yAxis, true);
  return { xAxis, yAxis, x, y };
}
