import type { ChartMark, SceneContext } from './scene-marks.ts';
import { chartFont } from './scene-style.ts';
import type { ChartModel, ChartTextParagraph } from './model.ts';


function titleLines(model: ChartModel): readonly ChartTextParagraph[] | undefined {
  return model.titleText?.flatMap(p => {
    const lines: Array<Omit<ChartTextParagraph, 'runs'> & { runs: Array<ChartTextParagraph['runs'][number]> }> = [{ ...p, runs: [] }];
    for (const run of p.runs) run.text.split(/\n|\u2028/).forEach((text, index) => {
      if (index) lines.push({ ...p, runs: [] });
      lines.at(-1)!.runs.push({ ...run, text });
    });
    return lines;
  });
}

export function chartTitleHeight(model: ChartModel): number {
  if (model.title === undefined) return 0;
  return titleLines(model)?.reduce((height, p) => height + Math.max(chartFont('title', model.titleStyle, model).size, ...p.runs.map(r => chartFont('title', { ...model.titleStyle, ...r.style }, model).size)) * 1.2, 0) ?? chartFont('title', model.titleStyle, model).size;
}
export function chartTitleMarks(context: SceneContext): ChartMark[] {
  const { model, width } = context;
  if (!model.titleText?.length) return model.title === undefined ? [] : [{ kind: 'text', text: model.title, x: width / 2, y: chartFont('title', model.titleStyle, model).size + 8, anchor: 'middle', font: chartFont('title', model.titleStyle, model, context.options.resolveColor) }];
  const marks: ChartMark[] = [];
  let y = 8;
  for (const paragraph of titleLines(model)!) {
    const runs = paragraph.runs.map(run => {
      const original = chartFont('title', { ...model.titleStyle, ...run.style }, model, context.options.resolveColor);
      const font = run.style?.verticalAlign && run.style.verticalAlign !== 'baseline' ? { ...original, size: original.size * .65 } : original;
      const spacing = (run.style?.characterSpacingPoints ?? 0) * 4 / 3;
      return { ...run, font, spacing, width: context.measure(run.text, font) + Math.max(0, [...run.text].length - 1) * spacing };
    });
    const size = Math.max(1, ...runs.map(run => run.font.size));
    y += size;
    const total = runs.reduce((sum, run) => sum + run.width, 0);
    let x = paragraph.alignment === 'start' ? 8 : paragraph.alignment === 'end' ? width - total - 8 : (width - total) / 2;
    for (const run of runs) {
      const baseline = y + (run.style?.verticalAlign === 'superscript' ? -size * .3 : run.style?.verticalAlign === 'subscript' ? size * .25 : 0);
      if (run.style?.highlight) marks.push({ kind: 'rect', x, y: baseline - run.font.size, width: run.width, height: run.font.size * 1.2, fill: run.style.highlight });
      if (run.spacing) {
        let offset = x;
        for (const text of run.text) { marks.push({ kind: 'text', text, x: offset, y: baseline, anchor: 'start', font: run.font }); offset += context.measure(text, run.font) + run.spacing; }
      } else marks.push({ kind: 'text', text: run.text, x, y: baseline, anchor: 'start', font: run.font });
      const stroke = run.font.color;
      if (run.style?.underline && run.style.underline !== 'none') {
        marks.push({ kind: 'line', x1: x, x2: x + run.width, y1: y + 2, y2: y + 2, stroke, width: 1 });
        if (run.style.underline === 'double') marks.push({ kind: 'line', x1: x, x2: x + run.width, y1: y + 4, y2: y + 4, stroke, width: 1 });
      }
      if (run.style?.strike) marks.push({ kind: 'line', x1: x, x2: x + run.width, y1: y - run.font.size * .3, y2: y - run.font.size * .3, stroke, width: 1 });
      x += run.width;
    }
    y += size * .2;
  }
  return marks;
}
