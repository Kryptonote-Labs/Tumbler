import { wordPointsToCssPixels, type ComputedWordTextFormat, type WordTextMeasurer } from "@tumblerjs/word";

export interface CanvasTextMetricSource {
  font: string;
  direction: CanvasDirection;
  measureText(text: string): TextMetrics;
}

/** Browser-backed shaping measurements converted into the point geometry used by Word layout. */
export function browserWordTextMeasurer(context: CanvasTextMetricSource): WordTextMeasurer {
  return Object.freeze({
    measure(text: string, format: ComputedWordTextFormat) {
      context.font = wordFontShorthand(format);
      context.direction = format.rightToLeft ? "rtl" : "ltr";
      const metrics = context.measureText(text);
      const scale = 1 / wordPointsToCssPixels(1);
      const fallbackAscent = wordPointsToCssPixels(format.fontSizePoints * 0.8);
      const fallbackDescent = wordPointsToCssPixels(format.fontSizePoints * 0.2);
      return Object.freeze({
        width: metrics.width * scale,
        // Font boxes stay constant for every glyph in a run. Painted glyph boxes do not:
        // an uppercase T and a lowercase letter can otherwise acquire different baselines.
        ascent: (metrics.fontBoundingBoxAscent || metrics.emHeightAscent || fallbackAscent) * scale,
        descent: (metrics.fontBoundingBoxDescent || metrics.emHeightDescent || fallbackDescent) * scale,
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
    `text-decoration-line:${decoration}`,
    `color:${format.color}`,
    `background:${format.highlight ?? "transparent"}`,
    `direction:${format.rightToLeft ? "rtl" : "ltr"}`,
    `vertical-align:${format.verticalAlign === "superscript" ? "super" : format.verticalAlign === "subscript" ? "sub" : "baseline"}`,
  ].join(";");
}

function wordFontShorthand(format: ComputedWordTextFormat): string {
  return `${format.italic ? "italic" : "normal"} normal ${format.bold ? 700 : 400} ${wordPointsToCssPixels(format.fontSizePoints)}px ${cssString(format.fontFamily)}, sans-serif`;
}

function cssString(value: string): string {
  return JSON.stringify(value.replaceAll("\\", "\\\\").replaceAll('"', '\\"'));
}
