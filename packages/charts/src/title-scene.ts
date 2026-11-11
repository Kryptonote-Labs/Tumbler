import type { ChartMark, SceneContext } from './scene-marks.ts';
import { chartFont } from './scene-style.ts';
import type { ChartModel } from './model.ts';
import { chartRichTextMarks, chartTextLines, layoutChartText } from './text-layout.ts';
import { positionChartText } from './text-position.ts';

export function chartTitleHeight(model: ChartModel): number {
  if (model.title === undefined) return 0;
  if (!model.titleText?.length) return chartFont('title', model.titleStyle, model).size;
  return chartTextLines(model.titleText).reduce((height, paragraph) => height + Math.max(1, ...(paragraph.runs.length
    ? paragraph.runs.map(run => chartFont('title', { ...model.titleStyle, ...run.style }, model).size)
    : [chartFont('title', model.titleStyle, model).size])) * 1.2, 0);
}

export function chartTitleMarks(context: SceneContext): ChartMark[] {
  const { model, width } = context;
  const marks: ChartMark[] = model.titleText?.length
    ? chartRichTextMarks(layoutChartText(context, 'title', model.titleStyle, model.titleText), 0, 8, width, 8)
    : model.title === undefined ? [] : [{ kind: 'text', text: model.title, x: width / 2, y: chartFont('title', model.titleStyle, model).size + 8, anchor: 'middle', font: chartFont('title', model.titleStyle, model, context.options.resolveColor) }];
  return positionChartText(context, marks, model.titleLayout);
}
