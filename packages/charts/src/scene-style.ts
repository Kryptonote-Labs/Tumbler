import { resolveChartColor } from "./colors.ts";
import type { ChartColor, ChartLineStyle, ChartModel, ChartTextStyle, SupportedChartModel } from "./model.ts";

/** Resolved type for one run of chart text. Sizes are CSS pixels. */
export interface ChartFont {
  readonly size: number;
  readonly family: string;
  readonly weight: number;
  readonly italic: boolean;
  readonly color: string;
}

/** Resolved stroke for an axis or gridline; `stroke: undefined` draws nothing. */
export interface ChartStroke {
  readonly stroke: string | undefined;
  readonly width: number;
}

export type ChartColorResolver = (color: ChartColor) => string | undefined;

const FAMILY = "Calibri, Aptos, system-ui, sans-serif";

/** Default type per text role, before authored chart properties apply. */
export const CHART_TEXT_DEFAULTS = {
  title: { size: 15, family: FAMILY, weight: 600, italic: false, color: "#222222" },
  tick: { size: 10, family: FAMILY, weight: 400, italic: false, color: "#555555" },
  category: { size: 10, family: FAMILY, weight: 400, italic: false, color: "#555555" },
  axisTitle: { size: 11, family: FAMILY, weight: 600, italic: false, color: "#333333" },
  legend: { size: 11, family: FAMILY, weight: 400, italic: false, color: "#000000" },
} as const satisfies Record<string, ChartFont>;

export type ChartTextRole = keyof typeof CHART_TEXT_DEFAULTS;

export const CHART_STROKE_DEFAULTS = {
  axis: { stroke: "#777777", width: 1 },
  gridline: { stroke: "#d9d9d9", width: 1 },
} as const satisfies Record<string, ChartStroke>;

/** CSS/canvas `font` shorthand, used for both drawing and measuring. */
export function chartFontShorthand(font: ChartFont): string {
  return `${font.italic ? "italic " : ""}${font.weight} ${font.size}px ${font.family}`;
}

/** Authored chart defaults merge under the element's own style. OOXML sizes and widths are points. */
export function chartFont(role: ChartTextRole, style: ChartTextStyle | undefined, model: ChartModel, resolve?: ChartColorResolver): ChartFont {
  const fallback = CHART_TEXT_DEFAULTS[role];
  const merged = { ...model.textStyle, ...style };
  const family = merged.fontFamily && (model.themeFonts?.[merged.fontFamily] ?? (merged.fontFamily.startsWith("+") ? undefined : merged.fontFamily));
  const color = merged.color && (resolve?.(merged.color) ?? resolveChartColor(merged.color, model));
  return {
    size: merged.fontSize === undefined ? fallback.size : merged.fontSize * 4 / 3,
    family: family ? `${JSON.stringify(family)}, sans-serif` : fallback.family,
    weight: merged.bold === undefined ? fallback.weight : merged.bold ? 700 : 400,
    italic: merged.italic ?? fallback.italic,
    color: color ?? fallback.color,
  };
}

export function chartStroke(role: keyof typeof CHART_STROKE_DEFAULTS, style: ChartLineStyle | undefined, model: ChartModel, resolve?: ChartColorResolver): ChartStroke {
  const fallback = CHART_STROKE_DEFAULTS[role];
  const color = style?.color && (resolve?.(style.color) ?? resolveChartColor(style.color, model));
  return {
    stroke: style?.noFill ? undefined : color ?? fallback.stroke,
    width: style?.width === undefined ? fallback.width : style.width * 4 / 3,
  };
}

/** Positions measured legend entries (swatch plus label) rather than equally sized slots. */
export function chartLegendPositions(widths: readonly number[], options: { readonly model: SupportedChartModel; readonly width: number; readonly height: number }) {
  const position = options.model.legend?.position ?? "right";
  const horizontal = position === "bottom" || position === "top";
  const gap = 12;
  const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
  let x = horizontal ? (options.width - total) / 2 : position === "left" ? 8 : options.width - Math.max(0, ...widths) - 8;
  let y = position === "bottom" ? options.height - 16
    : position === "top" || position === "top-right" ? (options.model.title === undefined ? 18 : 48)
    : (options.height - widths.length * 20) / 2 + 12;
  return widths.map(width => {
    const point = { x, y };
    if (horizontal) x += width + gap;
    else y += 20;
    return point;
  });
}
