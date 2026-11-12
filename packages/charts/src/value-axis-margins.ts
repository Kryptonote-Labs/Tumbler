import { cartesianAxisPositions } from './axis-positions.ts';
import { chartAxisFormat } from './axis-labels.ts';
import { chartTickLabel } from './tick-label.ts';
import { chartFont, type ChartFont } from './scene-style.ts';
import type { CartesianChartLayout } from './layout.ts';
import type { SupportedChartModel } from './model.ts';
import type { ChartSceneOptions } from './scene-marks.ts';

/** Automatic Cartesian frames reserve the formatted value labels, including host number formats. */
export function fitValueAxisLabels(model: SupportedChartModel, layout: CartesianChartLayout, measure: (text: string, font: ChartFont) => number, options: ChartSceneOptions, limits: { readonly left: number; readonly right: number }) {
  if (model.plotLayout || model.threeD || model.kind === 'bar' || model.kind === 'radar') return layout.plot;
  const { valueAxis, numericLabelEdge, labelSide } = cartesianAxisPositions(model, layout);
  if (!valueAxis || valueAxis.deleted || valueAxis.tickLabelPosition === 'none') return layout.plot;
  const font = chartFont('tick', valueAxis.textStyle, model, options.resolveColor);
  const format = chartAxisFormat(model, valueAxis);
  const labelWidth = layout.ticks.reduce((maximum, tick) => Math.max(maximum, measure(chartTickLabel(tick / (valueAxis.displayUnit ?? 1), format, { ...options, dateSystem: options.dateSystem ?? model.dateSystem ?? '1900' }), font)), 0);
  const missing = labelSide < 0 ? limits.left - (numericLabelEdge - 6 - labelWidth) : numericLabelEdge + 6 + labelWidth - limits.right;
  const inset = Math.min(Math.max(0, missing), Math.max(0, layout.plot.width - 1));
  return { ...layout.plot, x: layout.plot.x + (labelSide < 0 ? inset : 0), width: layout.plot.width - inset };
}
