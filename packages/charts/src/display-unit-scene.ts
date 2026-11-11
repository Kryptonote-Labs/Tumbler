import type { ChartAxis } from './model.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';
import { chartFont } from './scene-style.ts';
import { chartRichTextMarks, layoutChartText } from './text-layout.ts';
import { positionChartText } from './text-position.ts';
import { chartTextBoxMarks } from './text-box-scene.ts';

/** Display-unit labels have their own text, shape and fitted manual layout. */
export function chartDisplayUnitMarks(context: SceneContext, axis: ChartAxis, anchor: Pick<Extract<ChartMark, { kind: 'text' }>, 'x' | 'y' | 'anchor'>): ChartMark[] {
  if (!axis.showDisplayUnitLabel || axis.displayUnitName === undefined) return [];
  const font = chartFont('tick', { ...axis.textStyle, ...axis.displayUnitStyle }, context.model, context.options.resolveColor);
  const rich = axis.displayUnitText?.length ? layoutChartText(context, 'tick', { ...axis.textStyle, ...axis.displayUnitStyle }, axis.displayUnitText) : undefined;
  const content: ChartMark[] = rich ? chartRichTextMarks(rich, anchor.x - (anchor.anchor === 'middle' ? rich.width / 2 : anchor.anchor === 'end' ? rich.width : 0), anchor.y - rich.height, rich.width)
    : [{ kind: 'text', text: axis.displayUnitName, ...anchor, font }];
  const marks = chartTextBoxMarks(context, content, axis.displayUnitShape, axis.displayUnitStyle?.rotation);
  return positionChartText(context, marks, axis.displayUnitLayout, !!axis.displayUnitStyle?.rotation);
}
