import type { ChartRect } from "./layout.ts";
import type { ChartSeries, SupportedChartModel } from "./model.ts";
import { chartFont, chartLegendPositions, type ChartColorResolver, type ChartFont } from "./scene-style.ts";

/**
 * One drawing primitive of a chart, in CSS pixels. SVG and canvas heads draw the same marks, so
 * editor charts and rendered thumbnails agree.
 */
export type ChartMark =
  | { readonly kind: "rect"; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly fill: string; readonly stroke?: string }
  | { readonly kind: "circle"; readonly cx: number; readonly cy: number; readonly r: number; readonly fill: string; readonly stroke?: string; readonly fillOpacity?: number }
  /** An SVG path string. Paths without `fill` are stroked only. */
  | { readonly kind: "path"; readonly d: string; readonly fill?: string; readonly stroke?: string; readonly strokeWidth?: number }
  /** Axes and gridlines, drawn with crisp edges. */
  | { readonly kind: "line"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly stroke: string; readonly width: number }
  /** `rotate` turns the text about its anchor point, in degrees. */
  | { readonly kind: "text"; readonly text: string; readonly x: number; readonly y: number; readonly anchor: "start" | "middle" | "end"; readonly font: ChartFont; readonly rotate?: number }
  | { readonly kind: "clip"; readonly rect: ChartRect; readonly marks: readonly ChartMark[] };

export interface ChartScene {
  readonly width: number;
  readonly height: number;
  /** Accessible name for the whole chart. */
  readonly label: string;
  readonly marks: readonly ChartMark[];
}

export interface ChartSceneOptions {
  /** Host colour binding; takes precedence over the model's theme colours. */
  readonly resolveColor?: ChartColorResolver;
  readonly formatNumber?: (value: number, formatCode: string | undefined) => string;
  /**
   * Width of `text` in a CSS `font` shorthand. Legends use it to centre their entries; without it,
   * or when it returns undefined, widths are estimated from character count.
   */
  readonly measureText?: (text: string, font: string) => number | undefined;
}

/** Shared state for the per-kind scene builders. */
export interface SceneContext {
  readonly model: SupportedChartModel;
  readonly width: number;
  readonly height: number;
  readonly options: ChartSceneOptions;
  /** Series colour, falling back to the theme accent cycle as Office does. */
  color(series: ChartSeries, index: number, line?: boolean): string;
  measure(text: string, font: ChartFont): number;
}

/** A stroke that draws nothing produces no mark. */
export function line(x1: number, y1: number, x2: number, y2: number, style: { readonly stroke: string | undefined; readonly width: number }): ChartMark[] {
  return style.stroke === undefined ? [] : [{ kind: "line", x1, y1, x2, y2, stroke: style.stroke, width: style.width }];
}

/** Series legend entries: a swatch, then a label `labelX` pixels from the swatch's left edge. */
export function legendMarks(context: SceneContext, entries: readonly { readonly label: string; readonly swatch: (x: number, y: number) => ChartMark }[], labelX: number): ChartMark[] {
  const { model, width, height, options } = context;
  const font = chartFont("legend", model.legend?.textStyle, model, options.resolveColor);
  const widths = entries.map(entry => labelX + context.measure(entry.label, font));
  return chartLegendPositions(widths, { model, width, height }).flatMap((point, index): ChartMark[] => [
    entries[index]!.swatch(point.x, point.y),
    { kind: "text", text: entries[index]!.label, x: point.x + labelX, y: point.y, anchor: "start", font },
  ]);
}
