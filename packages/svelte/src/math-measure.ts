import type { MathMeasure } from "@tumblerjs/core/math";

let context: CanvasRenderingContext2D | null | undefined;

/**
 * Measures equation text with the browser's metrics for a CSS font family. Sizes stay in the
 * caller's unit, so a layout in CSS pixels or points paints with the same proportions.
 */
export function browserMathMeasure(fontFamily: string): MathMeasure {
  return (text, style) => {
    context ??= document.createElement("canvas").getContext("2d");
    if (!context) return [...text].length * style.size * 0.5;
    // Canvas rounds tiny font sizes, so measure at a fixed size and scale.
    context.font = `${style.italic ? "italic " : ""}${style.bold ? "700 " : ""}100px ${fontFamily}`;
    return (context.measureText(text).width * style.size) / 100;
  };
}
