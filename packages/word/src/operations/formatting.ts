import type { WordFormatPatch, WordRange } from "../collaboration/commands.ts";
export const clearCharacterFormatting = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  highlight: "none",
  verticalAlign: "baseline",
  characterSpacingPoints: 0,
  font: null,
  fontFamily: null,
  fontSize: null,
  color: null,
  shading: null,
  wordUnderline: null,
} satisfies WordFormatPatch;
export function paragraphStylePatch(styleId: string): WordFormatPatch {
  return {
    styleId,
    paragraph: null,
    font: null,
    fontFamily: null,
    fontSize: null,
    bold: null,
    italic: null,
    underline: null,
    wordUnderline: null,
    strike: null,
    highlight: null,
    verticalAlign: null,
    characterSpacingPoints: null,
    color: null,
    shading: null,
  };
}
export function containingParagraphRange(value: string, range: WordRange): WordRange {
  const start = range.start === 0 ? 0 : value.lastIndexOf("\n", range.start - 1) + 1;
  const last = value.indexOf("\n", Math.max(range.start, range.end - 1));
  return { start, end: last < 0 ? value.length : last };
}
