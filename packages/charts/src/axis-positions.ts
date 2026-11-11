import { chartAxisCrossing } from './axis-scale.ts';
import { cartesianGeometry } from './cartesian-geometry.ts';
import type { CartesianChartLayout } from './layout.ts';
import type { SupportedChartModel } from './model.ts';
import { xyGeometry } from './xy-geometry.ts';
import type { ScatterChartLayout } from './layout.ts';

/** Shared physical spines and label sides, including High/Low overrides and reversed categories. */
export function cartesianAxisPositions(model: SupportedChartModel, layout: CartesianChartLayout) {
  const { plot, minimum, maximum } = layout;
  const geometry = cartesianGeometry(model, layout);
  const { horizontal, valueAxis, categoryAxis, value, category, categoryBand, categoryReversed, dateCategory } = geometry;
  const numericPosition = value(chartAxisCrossing(valueAxis, minimum, maximum));
  const start = horizontal ? plot.y : plot.x, length = horizontal ? plot.height : plot.width;
  const edge = (maximum: boolean) => start + (maximum !== categoryReversed ? length : 0);
  const categoryPosition = categoryAxis?.crossesAt !== undefined
    ? categoryAxis.dateAxis ? dateCategory(categoryAxis.crossesAt) : valueAxis?.crossBetween === 'midCat' ? category(categoryAxis.crossesAt - 1) : categoryBand(categoryAxis.crossesAt - 1)
    : edge(categoryAxis?.crosses === 'max' || (categoryAxis?.crosses === undefined || categoryAxis.crosses === 'autoZero') && (valueAxis?.position === 'right' || valueAxis?.position === 'top'));
  const low = horizontal ? plot.y + plot.height : plot.x, high = horizontal ? plot.y : plot.x + plot.width;
  const side = valueAxis?.position === 'right' || valueAxis?.position === 'top' ? 1 : -1;
  const numericLabelEdge = valueAxis?.tickLabelPosition === 'high' ? high : valueAxis?.tickLabelPosition === 'low' ? low : categoryPosition;
  const labelSide = valueAxis?.tickLabelPosition === 'high' ? horizontal ? -1 : 1 : valueAxis?.tickLabelPosition === 'low' ? horizontal ? 1 : -1 : side * (horizontal ? -1 : 1);
  const categorySide = categoryAxis?.position === 'top' || categoryAxis?.position === 'right' ? -1 : 1;
  const categoryLabelEdge = categoryAxis?.tickLabelPosition === 'high' ? horizontal ? plot.x + plot.width : plot.y : categoryAxis?.tickLabelPosition === 'low' ? horizontal ? plot.x : plot.y + plot.height : numericPosition;
  const categoryLabelDirection = categoryAxis?.tickLabelPosition === 'high' ? -1 : categoryAxis?.tickLabelPosition === 'low' ? 1 : categorySide;
  return { ...geometry, numericPosition, categoryPosition, numericLabelEdge, labelSide, categoryLabelEdge, categoryLabelDirection };
}

export function xyAxisPosition(model: SupportedChartModel, layout: ScatterChartLayout, horizontal: boolean) {
  const { plot } = layout;
  const { xAxis, yAxis, x, y } = xyGeometry(model, layout);
  const axis = horizontal ? xAxis : yAxis;
  const spine = horizontal ? y(chartAxisCrossing(yAxis, layout.yMinimum, layout.yMaximum)) : x(chartAxisCrossing(xAxis, layout.xMinimum, layout.xMaximum));
  const side = axis?.tickLabelPosition === 'high' ? horizontal ? -1 : 1 : axis?.tickLabelPosition === 'low' ? horizontal ? 1 : -1 : horizontal ? axis?.position === 'top' ? -1 : 1 : axis?.position === 'right' ? 1 : -1;
  const edge = axis?.tickLabelPosition === 'high' ? horizontal ? plot.y : plot.x + plot.width : axis?.tickLabelPosition === 'low' ? horizontal ? plot.y + plot.height : plot.x : spine;
  return { axis, spine, side, edge };
}
