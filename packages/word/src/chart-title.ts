import { chartTitleRuns } from './chart-title-runs.ts';
import { wordHighlightColor } from './highlight.ts';
import { WORD_HIGHLIGHTS } from './text-properties.ts';
import { chartFont, type ChartModel, type ChartColor, type ChartTextParagraph } from '@tumblerjs/charts';
import type { WordTextParagraph } from './create.ts';
import { resolveWordColour } from './theme-colours.ts';

function opaqueColour(value: string): string {
  const rgba = /^rgba\((\d+),(\d+),(\d+),[\d.]+\)$/.exec(value);
  return rgba ? '#' + rgba.slice(1, 4).map(channel => Number(channel).toString(16).padStart(2, '0')).join('') : value;
}

/** Chart titles and shape text share the same editable Word paragraph representation. */
export function wordChartTitleText(model: ChartModel): readonly WordTextParagraph[] {
  const paragraphs = model.titleText ?? [{ alignment: 'center' as const, runs: [{ text: model.title ?? '' }] }];
  return paragraphs.map(p => ({ alignment: p.alignment ?? 'center', runs: p.runs.map(run => {
    const style = { ...model.titleStyle, ...run.style };
    const font = chartFont('title', style, model);
    const authoredFamily = style.fontFamily ?? model.textStyle?.fontFamily;
    const family = authoredFamily ? model.themeFonts?.[authoredFamily] ?? authoredFamily : model.themeFonts?.['+mn-lt'] ?? 'Aptos';
    return { text: run.text, format: { fontFamily: family, fontSizePoints: font.size * .75, bold: font.weight >= 600, italic: font.italic, color: opaqueColour(font.color), underline: style.underline ?? 'none', strike: style.strike ?? false, verticalAlign: style.verticalAlign ?? 'baseline', ...(style.characterSpacingPoints === undefined ? {} : { characterSpacingPoints: style.characterSpacingPoints }), ...(style.highlight ? { highlight: WORD_HIGHLIGHTS.find(value => wordHighlightColor(value) === style.highlight) ?? 'none' } : {}) } };
  }) }));
}
export function chartTitleFromWord(paragraphs: readonly WordTextParagraph[], previous?: ChartModel): readonly ChartTextParagraph[] {
  const references = previous && wordChartTitleText(previous);
  return chartTitleRuns(paragraphs, previous).map(({ paragraph: p, runs }, paragraphIndex) => ({ ...(p.alignment ? { alignment: p.alignment } : {}), runs: runs.map(({ run, source }, runIndex) => {
    const f = run.format ?? {};
    const prior = previous?.titleText?.[source?.paragraph ?? paragraphIndex]?.runs;
    const referenceRuns = references?.[source?.paragraph ?? paragraphIndex]?.runs;
    const matchesColor = (index: number) => typeof f.color === 'string' && resolveWordColour(f.color).toLowerCase() === String(referenceRuns?.[index]?.format?.color).toLowerCase();
    const preferred = source?.run ?? runIndex;
    const matched = matchesColor(preferred) ? preferred : -1;
    const reference = referenceRuns?.[matched >= 0 ? matched : preferred]?.format;
    const style = prior?.[matched >= 0 ? matched : preferred]?.style;
    const fontFamily = reference && f.fontFamily === reference.fontFamily ? style?.fontFamily : f.fontFamily;
    const fontSize = reference && f.fontSizePoints === reference.fontSizePoints ? style?.fontSize : f.fontSizePoints;
    const bold = reference && f.bold === reference.bold ? style?.bold : f.bold;
    const italic = reference && f.italic === reference.italic ? style?.italic : f.italic;
    const color: ChartColor | undefined = matched >= 0 ? style?.color : f.color === undefined ? undefined : typeof f.color === 'string' ? { kind: 'rgb', value: f.color } : {
      kind: 'scheme', value: f.color.theme,
      transforms: f.color.tint !== undefined ? [{ kind: 'lumMod', value: f.color.tint / 255 }, { kind: 'lumOff', value: 1 - f.color.tint / 255 }] : f.color.shade !== undefined ? [{ kind: 'lumMod', value: f.color.shade / 255 }] : [],
    };
    return { text: run.text, style: {
      ...(fontFamily === undefined ? {} : { fontFamily }),
      ...(fontSize === undefined ? {} : { fontSize }),
      ...(f.verticalAlign === undefined ? {} : { verticalAlign: f.verticalAlign }),
      ...(f.characterSpacingPoints === undefined ? {} : { characterSpacingPoints: f.characterSpacingPoints }),
      ...(f.highlight === undefined || f.highlight === 'none' ? {} : { highlight: wordHighlightColor(f.highlight) }),
      ...(bold === undefined ? {} : { bold }),
      ...(italic === undefined ? {} : { italic }),
      ...(f.underline === undefined ? {} : { underline: f.underline }),
      ...(f.strike === undefined ? {} : { strike: f.strike }),
      ...(color === undefined ? {} : { color }),
    } };
  }) }));
}
