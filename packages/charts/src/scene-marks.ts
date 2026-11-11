import type { ChartRect } from "./layout.ts";
import type { ChartSeries, ChartPointFormat, SupportedChartModel } from "./model.ts";
import { chartFont, chartLegendPositions, type ChartColorResolver, type ChartFont, type ChartStroke, type ChartStrokeDecoration } from "./scene-style.ts";

/**
 * One drawing primitive of a chart, in CSS pixels. SVG and canvas heads draw the same marks, so
 * editor charts and rendered thumbnails agree.
 */
export type ChartMark = (
  | { readonly kind: "rect"; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly fill: string; readonly stroke?: string; readonly strokeWidth?: number }
  | { readonly kind: "circle"; readonly cx: number; readonly cy: number; readonly r: number; readonly fill: string; readonly stroke?: string; readonly fillOpacity?: number; readonly strokeWidth?: number }
  /** An SVG path string. Paths without `fill` are stroked only. */
  | { readonly kind: "path"; readonly d: string; readonly fill?: string; readonly stroke?: string; readonly strokeWidth?: number }
  /** Axes and gridlines, drawn with crisp edges. */
  | { readonly kind: "line"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly stroke: string; readonly width: number }
  /** `rotate` turns the text about its anchor point, in degrees. */
  | { readonly kind: "text"; readonly text: string; readonly x: number; readonly y: number; readonly anchor: "start" | "middle" | "end"; readonly font: ChartFont; readonly rotate?: number }
  /**
   * Structure: an optional clip to `clip`, and a `role` naming the legend and each of its entries
   * so heads can expose them (the SVG head renders `chart-legend` and `chart-legend-entry` classes).
   */
  | { readonly kind: "group"; readonly role?: "legend" | "legend-entry"; readonly clip?: ChartRect; readonly marks: readonly ChartMark[] }) & ChartStrokeDecoration & { readonly strokeBounds?: ChartRect; readonly strokeBrushBounds?: ChartRect; readonly fillGradient?: import('./gradient-scene.ts').ChartGradientPaint; readonly fillPicture?: import('./fill-scene.ts').ChartPicturePaint; readonly fillPattern?: import('./fill-scene.ts').ChartPatternPaint };

export interface ChartScene {
  readonly width: number;
  readonly height: number;
  /** Accessible name for the whole chart. */
  readonly label: string;
  readonly marks: readonly ChartMark[];
}

export interface ChartSceneOptions {
  /** Chart location in CSS pixels in the parent pattern brush space. */
  readonly patternOrigin?: { readonly x: number; readonly y: number };
  readonly dateSystem?: "1900" | "1904";
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
  pointFormat(series: ChartSeries, index: number): ChartPointFormat | undefined;
  measure(text: string, font: ChartFont): number;
}

/** A stroke that draws nothing produces no mark. */
export function line(x1: number, y1: number, x2: number, y2: number, style: ChartStroke): ChartMark[] {
  return style.stroke === undefined ? [] : [{ kind: "line", x1, y1, x2, y2, ...style, stroke: style.stroke }];
}

/** Series legend entries: a swatch, then a label `labelX` pixels from the swatch's left edge. */
export function legendMarks(context: SceneContext, entries: readonly { readonly label: string; readonly swatch: (x: number, y: number) => ChartMark }[], labelX: number): ChartMark[] {
  const { model, width, height, options } = context;
  const font = chartFont("legend", model.legend?.textStyle, model, options.resolveColor);
  const widths = entries.map(entry => labelX + context.measure(entry.label, font));
  return [legendGroup(chartLegendPositions(widths, { model, width, height }).map((point, index) => [
    entries[index]!.swatch(point.x, point.y),
    { kind: "text", text: entries[index]!.label, x: point.x + labelX, y: point.y, anchor: "start", font },
  ]))];
}

/** Wraps legend entries, each a swatch and its label, in their structural groups. */
export function legendGroup(entries: readonly (readonly ChartMark[])[]): ChartMark {
  return { kind: "group", role: "legend", marks: entries.map(marks => ({ kind: "group", role: "legend-entry", marks })) };
}
