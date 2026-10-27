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

type CanvasTextFormat = Pick<ComputedWordTextFormat, 'fontFamily' | 'fontSizePoints' | 'bold' | 'italic' | 'rightToLeft' | 'kerningPoints' | 'characterSpacingPoints'>;
const measurementPixels = 1000;
let graphemes: Intl.Segmenter | undefined;

/** Measure typographic advances, independent of display-scale rounding at small font sizes.
 * An exact 1000px em also stays below browsers' large-font clamps. Hosts may supply a CSS
 * family stack so embedded fonts and fallback faces match their renderer. */
export function measureWordCanvasText(context: WordCanvasTextContext, text: string, format: CanvasTextFormat, family = wordFontFamily(format.fontFamily)): WordTextMeasurement {
  context.font = `${format.italic ? 'italic' : 'normal'} normal ${format.bold ? 700 : 400} ${measurementPixels}px ${family}`;
  context.fontKerning = wordFontKerning(format);
  context.direction = format.rightToLeft ? 'rtl' : 'ltr';
  const metrics = context.measureText(text);
  const scale = format.fontSizePoints / measurementPixels;
  const spacing = format.characterSpacingPoints ?? 0;
  return {
    width: Math.max(0, metrics.width * scale + (spacing ? [...(graphemes ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })).segment(text)].length * spacing : 0)),
    ascent: (metrics.fontBoundingBoxAscent || metrics.emHeightAscent || measurementPixels * 0.8) * scale,
    descent: (metrics.fontBoundingBoxDescent || metrics.emHeightDescent || measurementPixels * 0.2) * scale,
  };
}

/**
 * Canvas-backed shaping measurements converted into the point geometry used by Word layout.
 * Without line metrics, the font bounding box is used, which omits any external leading.
 * Results are memoised for the measurer's lifetime, so create a new one when fonts change.
 */
export function canvasWordTextMeasurer(context: WordCanvasTextContext, lineMetrics?: WordLineMetrics): WordTextMeasurer {
  const measured = new Map<string, WordTextMeasurement>();
  return Object.freeze({
    measure(text: string, format: ComputedWordTextFormat) {
      const font = wordCanvasFont(format);
      const direction = format.rightToLeft ? "rtl" : "ltr";
      const kerning = wordFontKerning(format);
      const key = `${kerning}\u0000${font}\u0000${direction}\u0000${format.characterSpacingPoints ?? 0}\u0000${text}`;
      const cached = measured.get(key);
      if (cached !== undefined) return cached;
      const metrics = measureWordCanvasText(context, text, format);
      const line = lineMetrics?.measure(format, wordFontFamily(format.fontFamily));
      const measurement = Object.freeze({
        width: metrics.width,
        // Font boxes stay constant for every glyph in a run. Painted glyph boxes do not:
        // an uppercase T and a lowercase letter can otherwise acquire different baselines.
        ascent: line?.ascent ?? metrics.ascent,
        descent: line?.descent ?? metrics.descent,
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
