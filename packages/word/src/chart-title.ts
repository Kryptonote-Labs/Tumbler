import { wordHighlightColor } from './highlight.ts';
import { WORD_HIGHLIGHTS } from './text-properties.ts';
import { chartFont, type ChartModel, type ChartTextParagraph } from '@tumblerjs/charts';
import type { WordTextParagraph } from './create.ts';
import { resolveWordColour } from './theme-colours.ts';

/** Chart titles and shape text share the same editable Word paragraph representation. */
export function wordChartTitleText(model: ChartModel): readonly WordTextParagraph[] {
  const paragraphs = model.titleText ?? [{ alignment: 'center' as const, runs: [{ text: model.title ?? '' }] }];
  return paragraphs.map(p => ({ alignment: p.alignment ?? 'center', runs: p.runs.map(run => {
    const style = { ...model.titleStyle, ...run.style };
    const font = chartFont('title', style, model);
    const family = style.fontFamily ? model.themeFonts?.[style.fontFamily] ?? style.fontFamily : 'Aptos';
    return { text: run.text, format: { fontFamily: family, fontSizePoints: font.size * .75, bold: font.weight >= 600, italic: font.italic, color: font.color, underline: style.underline ?? 'none', strike: style.strike ?? false, verticalAlign: style.verticalAlign ?? 'baseline', ...(style.characterSpacingPoints === undefined ? {} : { characterSpacingPoints: style.characterSpacingPoints }), ...(style.highlight ? { highlight: WORD_HIGHLIGHTS.find(value => wordHighlightColor(value) === style.highlight) ?? 'none' } : {}) } };
  }) }));
}
export function chartTitleFromWord(paragraphs: readonly WordTextParagraph[]): readonly ChartTextParagraph[] {
  return paragraphs.map(p => ({ ...(p.alignment ? { alignment: p.alignment } : {}), runs: p.runs.map(run => {
    const f = run.format ?? {};
    return { text: run.text, style: {
      ...(f.fontFamily === undefined ? {} : { fontFamily: f.fontFamily }),
      ...(f.fontSizePoints === undefined ? {} : { fontSize: f.fontSizePoints }),
      ...(f.verticalAlign === undefined ? {} : { verticalAlign: f.verticalAlign }),
      ...(f.characterSpacingPoints === undefined ? {} : { characterSpacingPoints: f.characterSpacingPoints }),
      ...(f.highlight === undefined || f.highlight === 'none' ? {} : { highlight: wordHighlightColor(f.highlight) }),
      ...(f.bold === undefined ? {} : { bold: f.bold }),
      ...(f.italic === undefined ? {} : { italic: f.italic }),
      ...(f.underline === undefined ? {} : { underline: f.underline }),
      ...(f.strike === undefined ? {} : { strike: f.strike }),
      ...(f.color === undefined ? {} : { color: { kind: 'rgb' as const, value: resolveWordColour(f.color) } }),
    } };
  }) }));
}
