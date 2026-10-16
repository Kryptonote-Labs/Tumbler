import { resolveChartColor, type ChartColor, type ChartLineStyle, type ChartModel, type ChartTextStyle } from "@tumblerjs/charts";

type ColorResolver = ((color: ChartColor) => string | undefined) | undefined;

/** Inline authored properties override the chart head's fallback CSS. Sizes are OOXML points. */
export function chartTextCss(style: ChartTextStyle | undefined, model: ChartModel, resolve?: ColorResolver): string {
  const merged = { ...model.textStyle, ...style };
  const family = merged.fontFamily && (model.themeFonts?.[merged.fontFamily] ?? (merged.fontFamily.startsWith("+") ? undefined : merged.fontFamily));
  const color = merged.color && (resolve?.(merged.color) ?? resolveChartColor(merged.color, model));
  return [
    merged.fontSize === undefined ? "" : `font-size:${merged.fontSize * 4 / 3}px`,
    family ? `font-family:${JSON.stringify(family)},sans-serif` : "",
    merged.bold === undefined ? "" : `font-weight:${merged.bold ? 700 : 400}`,
    merged.italic === undefined ? "" : `font-style:${merged.italic ? "italic" : "normal"}`,
    color ? `fill:${color}` : "",
  ].filter(Boolean).join(";");
}

export function chartLineCss(style: ChartLineStyle | undefined, model: ChartModel, resolve?: ColorResolver): string {
  const color = style?.color && (resolve?.(style.color) ?? resolveChartColor(style.color, model));
  return [style?.noFill ? "stroke:none" : color ? `stroke:${color}` : "", style?.width === undefined ? "" : `stroke-width:${style.width * 4 / 3}`].filter(Boolean).join(";");
}
