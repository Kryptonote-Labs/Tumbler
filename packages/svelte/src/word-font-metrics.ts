import { wordDisplayColour } from './word-display-colour.ts';
import { canvasWordTextMeasurer, wordFontFamily, wordHighlightColor, wordPointsToCssPixels, type ComputedWordTextFormat, type WordCanvasTextContext, type WordTextMeasurer, type WordLayoutFragment } from "@tumblerjs/word";
import { browserWordLineMetrics } from './word-line-metrics.ts';
import { browserWordBaselineOffset } from './word-baseline.ts';

/** Browser-backed shaping measurements, including the CSS leading that Canvas TextMetrics omits. */
export function browserWordTextMeasurer(context: WordCanvasTextContext): WordTextMeasurer {
  return canvasWordTextMeasurer(context, browserWordLineMetrics(context));
}

export function wordTextCss(format: ComputedWordTextFormat, background = '#ffffff'): string {
  const highlight = wordHighlightColor(format.highlight);
  const fill = highlight === 'transparent' ? format.shading ?? 'transparent' : highlight;
  const surface = fill === 'transparent' ? background : fill;
  const separateStrike = format.strike && format.underline === "double";
  const decoration = [format.underline === "none" ? "" : "underline", format.strike && !separateStrike ? "line-through" : ""].filter(Boolean).join(" ") || "none";
  return [
    `font-family:${wordFontFamily(format.fontFamily)}`,
    `font-size:${wordPointsToCssPixels(format.fontSizePoints)}px`,
    `font-weight:${format.bold ? 700 : 400}`,
    `font-style:${format.italic ? "italic" : "normal"}`,
    // Word defaults to unkerned text; inherited browser typography must not change advances.
    "font-kerning:none",
    `text-decoration-line:${decoration}`,
    `text-decoration-style:${format.underline === "double" ? "double" : "solid"}`,
    `letter-spacing:${wordPointsToCssPixels(format.characterSpacingPoints ?? 0)}px`,
    `color:${wordDisplayColour(format.color, surface)}`,
    `background-color:${wordDisplayColour(fill)}`,
    ...(separateStrike ? ["background-image:linear-gradient(currentColor,currentColor)", "background-size:100% 1px", "background-position:center", "background-repeat:no-repeat"] : []),
    `direction:${format.rightToLeft ? "rtl" : "ltr"}`,

  ].join(";");
}

/** Top of a CSS line box whose painted baseline matches the engine's point geometry. */
export function wordTextTop(
  fragment: Pick<WordLayoutFragment, 'format' | 'baseline' | 'height' | 'y'>,
  family = wordFontFamily(fragment.format.fontFamily),
): number {
  const offset = browserWordBaselineOffset(fragment.format, family, fragment.height);
  return offset === undefined ? fragment.y : fragment.baseline - offset;
}
