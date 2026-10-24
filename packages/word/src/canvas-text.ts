import { wordFontKerning } from './font-kerning.ts';
import { wordPointsToCssPixels, type WordTextMeasurement, type WordTextMeasurer } from "./layout.ts";
import type { ComputedWordTextFormat } from "./styles.ts";

/** The measuring subset of a Canvas 2D context. Browser, OffscreenCanvas and server canvases satisfy it. */
export interface WordCanvasTextContext {
  font: string;
  direction: "inherit" | "ltr" | "rtl";
  fontKerning?: "auto" | "none" | "normal";
  measureText(text: string): {
    readonly width: number;
    readonly fontBoundingBoxAscent?: number;
    readonly fontBoundingBoxDescent?: number;
    readonly emHeightAscent?: number;
    readonly emHeightDescent?: number;
  };
}

/** Font ascent and descent in points. Hosts that can observe CSS line boxes supply leading here. */
export interface WordLineMetrics {
  measure(format: Pick<ComputedWordTextFormat, "fontSizePoints" | "bold" | "italic">, family: string): { readonly ascent: number; readonly descent: number } | undefined;
}

/**
 * Canvas-backed shaping measurements converted into the point geometry used by Word layout.
 * Without line metrics, the font bounding box is used, which omits any external leading.
 * Results are memoised for the measurer's lifetime, so create a new one when fonts change.
 */
export function canvasWordTextMeasurer(context: WordCanvasTextContext, lineMetrics?: WordLineMetrics): WordTextMeasurer {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const measured = new Map<string, WordTextMeasurement>();
  return Object.freeze({
    measure(text: string, format: ComputedWordTextFormat) {
      const font = wordCanvasFont(format);
      const direction = format.rightToLeft ? "rtl" : "ltr";
      const kerning = wordFontKerning(format);
      const key = `${kerning}\u0000${font}\u0000${direction}\u0000${format.characterSpacingPoints ?? 0}\u0000${text}`;
      const cached = measured.get(key);
      if (cached !== undefined) return cached;
      context.font = font;
      context.fontKerning = kerning;
      context.direction = direction;
      const metrics = context.measureText(text);
      const line = lineMetrics?.measure(format, wordFontFamily(format.fontFamily));
      const scale = 1 / wordPointsToCssPixels(1);
      const fallbackAscent = wordPointsToCssPixels(format.fontSizePoints * 0.8);
      const fallbackDescent = wordPointsToCssPixels(format.fontSizePoints * 0.2);
      const measurement = Object.freeze({
        width: Math.max(0, metrics.width * scale + [...segmenter.segment(text)].length * (format.characterSpacingPoints ?? 0)),
        // Font boxes stay constant for every glyph in a run. Painted glyph boxes do not:
        // an uppercase T and a lowercase letter can otherwise acquire different baselines.
        ascent: line?.ascent ?? (metrics.fontBoundingBoxAscent || metrics.emHeightAscent || fallbackAscent) * scale,
        descent: line?.descent ?? (metrics.fontBoundingBoxDescent || metrics.emHeightDescent || fallbackDescent) * scale,
      });
      measured.set(key, measurement);
      return measurement;
    },
  });
}

/** CSS font shorthand for a run. Sizes are CSS pixels unless `pixelsPerPoint` is given. */
export function wordCanvasFont(format: Pick<ComputedWordTextFormat, "fontFamily" | "fontSizePoints" | "bold" | "italic">, pixelsPerPoint = wordPointsToCssPixels(1)): string {
  return `${format.italic ? "italic" : "normal"} normal ${format.bold ? 700 : 400} ${format.fontSizePoints * pixelsPerPoint}px ${wordFontFamily(format.fontFamily)}`;
}

/** A quoted Word font family with the generic fallback used by every Tumbler renderer. */
export function wordFontFamily(family: string): string {
  return `${JSON.stringify(family.replaceAll("\\", "\\\\").replaceAll('"', '\\"'))}, sans-serif`;
}
