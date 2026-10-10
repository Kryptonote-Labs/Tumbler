import { wordHighlightColor } from './word-highlight.ts';
import { wordPointsToCssPixels, type ComputedWordTextFormat, type WordTextMeasurer, type WordLayoutFragment } from "@tumblerjs/word";
import { browserWordLineMetrics } from './word-line-metrics.ts';
import { browserWordBaselineOffset } from './word-baseline.ts';

export interface CanvasTextMetricSource {
  font: string;
  direction: CanvasDirection;
  fontKerning?: CanvasFontKerning;
  measureText(text: string): TextMetrics;
}

/** Browser-backed shaping measurements converted into the point geometry used by Word layout. */
export function browserWordTextMeasurer(context: CanvasTextMetricSource): WordTextMeasurer {
  const lineMetrics = browserWordLineMetrics(context);
  return Object.freeze({
    measure(text: string, format: ComputedWordTextFormat) {
      context.font = wordFontShorthand(format);
      context.fontKerning = "none";
      context.direction = format.rightToLeft ? "rtl" : "ltr";
      const metrics = context.measureText(text);
      const line = lineMetrics.measure(format, `${cssString(format.fontFamily)}, sans-serif`);
      const scale = 1 / wordPointsToCssPixels(1);
      const fallbackAscent = wordPointsToCssPixels(format.fontSizePoints * 0.8);
      const fallbackDescent = wordPointsToCssPixels(format.fontSizePoints * 0.2);
      return Object.freeze({
        width: metrics.width * scale,
        // Font boxes stay constant for every glyph in a run. Painted glyph boxes do not:
        // an uppercase T and a lowercase letter can otherwise acquire different baselines.
        ascent: line?.ascent ?? (metrics.fontBoundingBoxAscent || metrics.emHeightAscent || fallbackAscent) * scale,
        descent: line?.descent ?? (metrics.fontBoundingBoxDescent || metrics.emHeightDescent || fallbackDescent) * scale,
      });
    },
  });
}

export function wordTextCss(format: ComputedWordTextFormat): string {
  const decoration = [format.underline === "none" ? "" : "underline", format.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none";
  return [
    `font-family:${cssString(format.fontFamily)},sans-serif`,
    `font-size:${wordPointsToCssPixels(format.fontSizePoints)}px`,
    `font-weight:${format.bold ? 700 : 400}`,
    `font-style:${format.italic ? "italic" : "normal"}`,
    // Word defaults to unkerned text; inherited browser typography must not change advances.
    "font-kerning:none",
    `text-decoration-line:${decoration}`,
    `color:${format.color}`,
    `background:${wordHighlightColor(format.highlight)}`,
    `direction:${format.rightToLeft ? "rtl" : "ltr"}`,
    `vertical-align:${format.verticalAlign === "superscript" ? "super" : format.verticalAlign === "subscript" ? "sub" : "baseline"}`,
  ].join(";");
}

/** Top of a CSS line box whose painted baseline matches the engine's point geometry. */
export function wordTextTop(
  fragment: Pick<WordLayoutFragment, 'format' | 'baseline' | 'height' | 'y'>,
  family = `${cssString(fragment.format.fontFamily)}, sans-serif`,
): number {
  const offset = browserWordBaselineOffset(fragment.format, family, fragment.height);
  return offset === undefined ? fragment.y : fragment.baseline - offset;
}

function wordFontShorthand(format: ComputedWordTextFormat): string {
  return `${format.italic ? "italic" : "normal"} normal ${format.bold ? 700 : 400} ${wordPointsToCssPixels(format.fontSizePoints)}px ${cssString(format.fontFamily)}, sans-serif`;
}

function cssString(value: string): string {
  return JSON.stringify(value.replaceAll("\\", "\\\\").replaceAll('"', '\\"'));
}
