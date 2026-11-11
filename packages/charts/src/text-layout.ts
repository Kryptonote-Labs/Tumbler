import type { ChartTextParagraph, ChartTextStyle } from './model.ts';
import { chartFont, type ChartTextRole } from './scene-style.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';

export function chartTextLines(paragraphs: readonly ChartTextParagraph[]): readonly ChartTextParagraph[] {
  return paragraphs.flatMap(paragraph => {
    const lines: Array<Omit<ChartTextParagraph, 'runs'> & { runs: Array<ChartTextParagraph['runs'][number]> }> = [{ ...paragraph, runs: [] }];
    for (const run of paragraph.runs) run.text.split(/\n|\u2028/).forEach((text, index) => {
      if (index) lines.push({ ...paragraph, runs: [] });
      lines.at(-1)!.runs.push({ ...run, text });
    });
    return lines;
  });
}

/** Measure native rich runs once, including script size and authored character spacing. */
export function layoutChartText(context: SceneContext, role: ChartTextRole, style: ChartTextStyle | undefined, paragraphs: readonly ChartTextParagraph[]) {
  const lines = chartTextLines(paragraphs).map(paragraph => {
    const runs = paragraph.runs.map(run => {
      const original = chartFont(role, { ...style, ...run.style }, context.model, context.options.resolveColor);
      const font = run.style?.verticalAlign && run.style.verticalAlign !== 'baseline' ? { ...original, size: original.size * .65 } : original;
      const spacing = (run.style?.characterSpacingPoints ?? 0) * 4 / 3;
      const glyphs = spacing ? [...run.text].map(text => ({ text, width: context.measure(text, font) })) : undefined;
      const width = (glyphs ? glyphs.reduce((sum, glyph) => sum + glyph.width, 0) + Math.max(0, glyphs.length - 1) * spacing : context.measure(run.text, font));
      return { ...run, originalSize: original.size, font, spacing, glyphs, width };
    });
    return { ...paragraph, runs, size: Math.max(1, ...(runs.length ? runs.map(run => run.originalSize) : [chartFont(role, style, context.model).size])), width: runs.reduce((sum, run) => sum + run.width, 0) };
  });
  return { lines, width: Math.max(0, ...lines.map(line => line.width)), height: lines.reduce((sum, line) => sum + line.size * 1.2, 0) };
}

export function chartRichTextMarks(layout: ReturnType<typeof layoutChartText>, x: number, top: number, width: number, padding = 0): ChartMark[] {
  const marks: ChartMark[] = [];
  let y = top;
  for (const paragraph of layout.lines) {
    y += paragraph.size;
    let left = paragraph.alignment === 'start' ? x + padding : paragraph.alignment === 'end' ? x + width - paragraph.width - padding : x + (width - paragraph.width) / 2;
    for (const run of paragraph.runs) {
      const baseline = y + (run.style?.verticalAlign === 'superscript' ? -paragraph.size * .3 : run.style?.verticalAlign === 'subscript' ? paragraph.size * .25 : 0);
      if (run.style?.highlight) marks.push({ kind: 'rect', x: left, y: baseline - run.font.size, width: run.width, height: run.font.size * 1.2, fill: run.style.highlight });
      if (run.glyphs) {
        let offset = left;
        for (const glyph of run.glyphs) {
          marks.push({ kind: 'text', text: glyph.text, x: offset, y: baseline, anchor: 'start', font: run.font }); offset += glyph.width + run.spacing;
        }
      } else marks.push({ kind: 'text', text: run.text, x: left, y: baseline, anchor: 'start', font: run.font });
      const stroke = run.font.color;
      if (run.style?.underline && run.style.underline !== 'none') {
        marks.push({ kind: 'line', x1: left, x2: left + run.width, y1: baseline + 2, y2: baseline + 2, stroke, width: 1 });
        if (run.style.underline === 'double') marks.push({ kind: 'line', x1: left, x2: left + run.width, y1: baseline + 4, y2: baseline + 4, stroke, width: 1 });
      }
      if (run.style?.strike) marks.push({ kind: 'line', x1: left, x2: left + run.width, y1: baseline - run.font.size * .3, y2: baseline - run.font.size * .3, stroke, width: 1 });
      left += run.width;
    }
    y += paragraph.size * .2;
  }
  return marks;
}
