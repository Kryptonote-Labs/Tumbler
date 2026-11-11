import type { ChartAxis } from './model.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';
import { layoutChartLegend } from './legend-layout.ts';
import { chartMarksBounds } from './shape-scene.ts';
import { chartTitleHeight } from './title-scene.ts';
import { translateChartMark } from './mark-translation.ts';
import { positionChartText } from './text-position.ts';

export function chartAxisTitleFrame(context: SceneContext, bands?: readonly number[]) {
  const legend = layoutChartLegend(context.model, context.width, context.height, context.measure, bands, context.options.resolveColor, context.options);
  const top = context.model.title !== undefined && !context.model.titleOverlay ? chartTitleHeight(context.model, context.measure) + 12 : 4;
  const x = legend.space.left + 4, y = top + legend.space.top;
  return { x, y, width: Math.max(0, context.width - legend.space.right - 4 - x), height: Math.max(0, context.height - legend.space.bottom - 4 - y) };
}

/** Keep explicitly oriented axis titles in the reserved strip inside the title and legend bands. */
export function chartAxisTitleMarks(context: SceneContext, axis: ChartAxis, marks: ChartMark[], side: ChartAxis['position']): ChartMark[] {
  if (axis.titleStyle?.rotation === undefined || axis.titleLayout && (axis.titleLayout.x !== undefined || axis.titleLayout.y !== undefined)) return positionChartText(context, marks, axis.titleLayout);
  const bounds = chartMarksBounds(context, marks);
  if (!bounds) return marks;
  const frame = context.axisTitleFrame ?? chartAxisTitleFrame(context);
  const x = side === 'left' ? frame.x - bounds.x : side === 'right' ? frame.x + frame.width - bounds.width - bounds.x : 0;
  const y = side === 'top' ? frame.y - bounds.y : side === 'bottom' ? frame.y + frame.height - bounds.height - bounds.y : 0;
  return positionChartText(context, marks.map(mark => translateChartMark(mark, x, y)), undefined, true);
}
