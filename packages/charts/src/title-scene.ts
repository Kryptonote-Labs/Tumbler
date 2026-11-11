import type { ChartMark, SceneContext } from './scene-marks.ts';
import { chartFont, type ChartFont } from './scene-style.ts';
import type { ChartModel } from './model.ts';
import { chartRichTextMarks, chartTextLines, layoutChartText } from './text-layout.ts';
import { positionChartText } from './text-position.ts';
import { chartTextBoxMarks } from './text-box-scene.ts';

export function chartTitleHeight(model: ChartModel, measure: (text: string, font: ChartFont) => number = (text, font) => text.length * font.size * .55): number {
  if (model.title === undefined) return 0;
  if (model.titleStyle?.rotation) {
    const fitted = layoutChartText({ model, measure, options: {} }, 'title', model.titleStyle, model.titleText?.length ? model.titleText : [{ runs: [{ text: model.title }] }]);
    const angle = model.titleStyle.rotation * Math.PI / 180;
    return Math.abs(Math.sin(angle)) * fitted.width + Math.abs(Math.cos(angle)) * fitted.height;
  }
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
  return positionChartText(context, chartTextBoxMarks(context, marks, model.titleArea, model.titleStyle?.rotation, { x: 4, y: 3 }), model.titleLayout, !!model.titleStyle?.rotation);
}
