import type { ChartAxis } from './model.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';
import { layoutChartLegend } from './legend-layout.ts';
import { chartMarksBounds } from './shape-scene.ts';
import { chartTitleHeight } from './title-scene.ts';
import { translateChartMark } from './mark-translation.ts';
import { positionChartText } from './text-position.ts';
import { chartRichTextMarks, layoutChartText } from './text-layout.ts';
import { chartTextBoxMarks } from './text-box-scene.ts';
import { chartAxisTitleRotation, chartAxisTitleSide } from './axis-title-space.ts';
import { chartFont } from './scene-style.ts';
import type { ChartRect } from './layout.ts';

export function chartAxisTitleFrame(context: SceneContext, bands?: readonly number[]) {
  const legend = layoutChartLegend(context.model, context.width, context.height, context.measure, bands, context.options.resolveColor, context.options);
  const top = context.model.title !== undefined && !context.model.titleOverlay ? chartTitleHeight(context.model, context.measure) + 12 : 4;
  const x = legend.space.left + 4, y = top + legend.space.top;
  return { x, y, width: Math.max(0, context.width - legend.space.right - 4 - x), height: Math.max(0, context.height - legend.space.bottom - 4 - y) };
}

/** Keep fitted axis-title paint and rich text inside the title and legend bands. */
export function chartAxisTitleMarks(context: SceneContext, axis: ChartAxis, anchors: ChartMark[], side: ChartAxis['position']): ChartMark[] {
  const marks = axis.titleText || axis.titleShape ? richAxisTitle(context, axis, anchors) : anchors;
  if (axis.titleStyle?.rotation === undefined && !axis.titleText && !axis.titleShape || axis.titleLayout && (axis.titleLayout.x !== undefined || axis.titleLayout.y !== undefined)) return positionChartText(context, marks, axis.titleLayout);
  const bounds = chartMarksBounds(context, marks);
  if (!bounds) return marks;
  const frame = context.axisTitleFrame ?? chartAxisTitleFrame(context);
  const x = side === 'left' ? frame.x - bounds.x : side === 'right' ? frame.x + frame.width - bounds.width - bounds.x : 0;
  const y = side === 'top' ? frame.y - bounds.y : side === 'bottom' ? frame.y + frame.height - bounds.height - bounds.y : 0;
  return positionChartText(context, marks.map(mark => translateChartMark(mark, x, y)), undefined, true);
}

function richAxisTitle(context: SceneContext, axis: ChartAxis, anchors: ChartMark[]): ChartMark[] {
  const anchor = anchors.find(mark => mark.kind === 'text');
  if (anchor?.kind !== 'text') return anchors;
  const bounds = chartMarksBounds(context, [anchor]);
  if (!bounds) return anchors;
  const layout = layoutChartText(context, 'axisTitle', axis.titleStyle, axis.titleText?.length ? axis.titleText : [{ runs: [{ text: anchor.text }] }]);
  const content = chartRichTextMarks(layout, bounds.x + (bounds.width - layout.width) / 2, bounds.y + (bounds.height - layout.height) / 2, layout.width);
  const marks = chartTextBoxMarks(context, content, axis.titleShape, anchor.rotate);
  return anchor.rotate === 0 ? marks.map(mark => mark.kind === 'text' ? { ...mark, rotate: 0 } : mark) : marks;
}

/** Contour plots have category, value and series titles without projected 3-D axis spines. */
export function chartContourAxisTitles(context: SceneContext, plot: ChartRect): ChartMark[] {
  return context.model.axes.flatMap(axis => {
    if (!axis.title) return [];
    const { horizontal, side } = chartAxisTitleSide(context.model, axis);
    const font = chartFont('axisTitle', axis.titleStyle, context.model, context.options.resolveColor);
    const anchor: ChartMark = { kind: 'text', text: axis.title, font, anchor: 'middle', rotate: chartAxisTitleRotation(context.model, axis),
      x: horizontal ? plot.x + plot.width / 2 : side === 'right' ? context.width - font.size : font.size,
      y: horizontal ? side === 'top' ? font.size + 4 : context.height - font.size / 2 : plot.y + plot.height / 2 };
    return chartAxisTitleMarks(context, axis, [anchor], side);
  });
}
