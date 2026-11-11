import type { ChartAxis } from './model.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';
import { chartFont } from './scene-style.ts';
import { chartMarksBounds, chartShapeMarks } from './shape-scene.ts';
import { chartRichTextMarks, layoutChartText } from './text-layout.ts';
import { positionChartText } from './text-position.ts';
import { rotateChartText } from './text-rotation.ts';

/** Display-unit labels have their own text, shape and fitted manual layout. */
export function chartDisplayUnitMarks(context: SceneContext, axis: ChartAxis, anchor: Pick<Extract<ChartMark, { kind: 'text' }>, 'x' | 'y' | 'anchor'>): ChartMark[] {
  if (!axis.showDisplayUnitLabel || axis.displayUnitName === undefined) return [];
  const font = chartFont('tick', { ...axis.textStyle, ...axis.displayUnitStyle }, context.model, context.options.resolveColor);
  const rich = axis.displayUnitText?.length ? layoutChartText(context, 'tick', { ...axis.textStyle, ...axis.displayUnitStyle }, axis.displayUnitText) : undefined;
  const marks = rotateChartText(context, rich ? chartRichTextMarks(rich, anchor.x - (anchor.anchor === 'middle' ? rich.width / 2 : anchor.anchor === 'end' ? rich.width : 0), anchor.y - rich.height, rich.width)
    : [{ kind: 'text', text: axis.displayUnitName, ...anchor, font }], axis.displayUnitStyle?.rotation);
  const bounds = chartMarksBounds(context, marks);
  if (bounds) marks.unshift(...chartShapeMarks(context, { x: bounds.x - 3, y: bounds.y - 2, width: bounds.width + 6, height: bounds.height + 4 }, axis.displayUnitShape));
  return positionChartText(context, marks, axis.displayUnitLayout, !!axis.displayUnitStyle?.rotation);
}
