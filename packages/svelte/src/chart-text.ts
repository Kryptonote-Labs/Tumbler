let context: CanvasRenderingContext2D | null | undefined;

/** Measures chart text with the page's loaded fonts. Server rendering falls back to estimates. */
export function measureChartText(text: string, font: string): number | undefined {
  if (typeof document === "undefined") return undefined;
  context ??= document.createElement("canvas").getContext("2d");
  if (!context) return undefined;
  context.font = font;
  return context.measureText(text).width;
}
