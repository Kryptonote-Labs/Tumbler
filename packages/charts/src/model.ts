import type { DrawingStrokeProperties } from "@tumblerjs/ooxml";
export type ChartKind = "bar" | "column" | "line" | "pie" | "doughnut" | "scatter" | "bubble" | "area" | "radar" | "stock" | "surface" | "of-pie";

export type ChartScatterStyle = "none" | "line" | "line-marker" | "marker" | "smooth" | "smooth-marker";

export type ChartBubbleSizeRepresentation = "area" | "width";

/** Maximum bubble count accepted by parsing, host binding, and layout. */
export const BUBBLE_CHART_POINT_LIMIT = 10_000;

export type ChartMarkerSymbol = "auto" | "circle" | "dash" | "diamond" | "dot" | "none" | "picture" | "plus" | "square" | "star" | "triangle" | "x";

export interface ChartMarker {
  readonly picture?: import('./picture-parser.ts').ChartPictureFill;
  readonly gradient?: ChartGradient;
  readonly fill?: ChartColor;
  readonly noFill?: boolean;
  readonly lineStyle?: ChartLineStyle;
  readonly symbol?: ChartMarkerSymbol;
  readonly size?: number;
}

export interface ChartColorTransform {
  readonly kind: "lumMod" | "lumOff";
  readonly value: number;
}

export type ChartColor = (
  | { readonly kind: "rgb"; readonly value: string }
  | { readonly kind: "scheme"; readonly value: string }) & {
  readonly transforms?: readonly ChartColorTransform[];
  readonly source?: import("@tumblerjs/ooxml").LosslessXmlElement;
};

export interface ChartTextStyle {
  /** Retained run properties for lossless rich title editing. */
  readonly sourceProperties?: import('@tumblerjs/ooxml').LosslessXmlElement;
  readonly highlight?: string;
  readonly verticalAlign?: "baseline" | "superscript" | "subscript";
  readonly characterSpacingPoints?: number;
  readonly underline?: "none" | "single" | "double";
  readonly strike?: boolean;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly color?: ChartColor;
}

export interface ChartLineStyle extends DrawingStrokeProperties {
  readonly color?: ChartColor;
  readonly noFill?: boolean;
  /** Width in points. */
  readonly width?: number;
}

export interface ChartGradient {
  /** Normalized focus edges, not the four DrawingML inset amounts. */
  readonly focusRect?: readonly [number, number, number, number];
  readonly kind: 'linear' | 'radial' | 'rectangular';
  readonly angle: number;
  readonly scaled: boolean;
  readonly center: readonly [number, number];
  readonly stops: readonly { readonly offset: number; readonly color: ChartColor }[];
}

export interface ChartShapeStyle {
  readonly picture?: import('./picture-parser.ts').ChartPictureFill;
  readonly gradient?: ChartGradient;
  readonly fill?: ChartColor | undefined;
  readonly noFill?: boolean | undefined;
  readonly lineStyle?: ChartLineStyle | undefined;
}

export interface ChartDataPoint {
  readonly index: number;
  readonly value: string | number;
}

export interface ChartDataSequence {
  readonly kind: "number" | "string";
  readonly formula: string | undefined;
  readonly formatCode: string | undefined;
  readonly points: readonly ChartDataPoint[];
  /** Hierarchical category caches, with the innermost labels first. */
  readonly levels?: readonly (readonly ChartDataPoint[])[];
}

export interface ChartPointFormat {
  readonly picture?: import('./picture-parser.ts').ChartPictureFill;
  readonly bubble3D?: boolean;
  readonly gradient?: ChartGradient;
  readonly index: number;
  readonly fill?: ChartColor | undefined;
  readonly noFill?: boolean | undefined;
  readonly lineStyle?: ChartLineStyle | undefined;
  readonly marker?: ChartMarker | undefined;
  readonly explosion?: number | undefined;
}

export interface ChartSeries {
  readonly picture?: import('./picture-parser.ts').ChartPictureFill;
  readonly bubble3D?: boolean;
  readonly barShape?: import('./bar-shapes.ts').ChartBarShape;
  readonly gradient?: ChartGradient;
  readonly trendlines?: readonly import('./analytics-parser.ts').ChartTrendline[];
  readonly errorBars?: readonly import('./analytics-parser.ts').ChartErrorBars[];
  readonly dataLabels?: import('./data-labels.ts').ChartDataLabels;
  readonly noFill?: boolean;
  readonly lineStyle?: ChartLineStyle;
  readonly pointFormats?: readonly ChartPointFormat[];
  readonly explosion?: number;
  readonly index: number;
  readonly order: number;
  readonly title: string | undefined;
  readonly titleFormula: string | undefined;
  readonly categories: ChartDataSequence | undefined;
  /** Numeric X coordinates for an XY scatter series. */
  readonly xValues?: ChartDataSequence;
  readonly values: ChartDataSequence | undefined;
  /** Numeric bubble magnitudes paired to X/Y coordinates by cache index. */
  readonly bubbleSizes?: ChartDataSequence;
  readonly fill: ChartColor | undefined;
  readonly line: ChartColor | undefined;
  readonly marker?: ChartMarker;
  readonly smooth?: boolean;
}

export type ChartLegendPosition = "bottom" | "left" | "right" | "top" | "top-right";

export interface ChartLegend {
  readonly shapeStyle?: ChartShapeStyle;
  readonly textStyle?: ChartTextStyle;
  readonly position: ChartLegendPosition;
  readonly overlay: boolean;
}

export interface ChartAxis {
  readonly sourceType?: string;
  readonly logBase?: number;
  readonly reversed?: boolean;
  readonly crossAxisId?: number;
  readonly crosses?: 'autoZero' | 'min' | 'max';
  readonly crossesAt?: number;
  readonly crossBetween?: 'between' | 'midCat';
  readonly tickLabelPosition?: 'high' | 'low' | 'nextTo' | 'none';
  readonly majorTickMark?: 'cross' | 'in' | 'out' | 'none';
  readonly minorTickMark?: 'cross' | 'in' | 'out' | 'none';
  readonly minorUnit?: number;
  readonly minorGridlines?: boolean;
  readonly minorGridlineStyle?: ChartLineStyle;
  readonly tickLabelSkip?: number;
  readonly tickMarkSkip?: number;
  readonly labelOffset?: number;
  readonly titleStyle?: ChartTextStyle;
  readonly displayUnit?: number;
  readonly displayUnitName?: string;
  readonly showDisplayUnitLabel?: boolean;
  readonly dateAxis?: boolean;
  readonly baseTimeUnit?: 'days' | 'months' | 'years';
  readonly majorTimeUnit?: 'days' | 'months' | 'years';
  readonly minorTimeUnit?: 'days' | 'months' | 'years';
  /** Degrees clockwise; omitted means automatic label layout. */
  readonly labelRotation?: number;
  readonly textStyle?: ChartTextStyle;
  readonly lineStyle?: ChartLineStyle;
  readonly gridlineStyle?: ChartLineStyle;
  readonly id: number;
  readonly kind: "category" | "value" | "series";
  readonly position: "bottom" | "left" | "right" | "top";
  readonly title: string | undefined;
  readonly majorGridlines: boolean;
  readonly majorUnit?: number;
  readonly minimum: number | undefined;
  readonly maximum: number | undefined;
  readonly deleted: boolean;
  readonly numberFormatCode?: string;
  readonly numberFormatSourceLinked?: boolean;
}

export interface ChartTextParagraph {
  readonly sourceProperties?: import('@tumblerjs/ooxml').LosslessXmlElement;
  readonly alignment?: "start" | "center" | "end" | "justify";
  readonly runs: readonly { readonly text: string; readonly style?: ChartTextStyle }[];
}

interface ChartModelBase {
  readonly images?: Readonly<Record<string, import('./picture-parser.ts').ChartImage>>;
  readonly chartArea?: ChartShapeStyle;
  readonly titleArea?: ChartShapeStyle;
  readonly titleOverlay?: boolean;
  readonly dateSystem?: "1900" | "1904";
  readonly titleText?: readonly ChartTextParagraph[];
  readonly textStyle?: ChartTextStyle;
  readonly titleStyle?: ChartTextStyle;
  readonly themeFonts?: Readonly<Record<string, string>>;
  /** Host-document scheme colours, retaining authored scheme references in the series. */
  readonly themeColors?: Readonly<Record<string, string>>;
  readonly title: string | undefined;
  readonly titleFormula?: string;
  readonly legend: ChartLegend | undefined;
}

export interface SupportedChartModel extends ChartModelBase {
  readonly dropLines?: ChartLineStyle;
  readonly highLowLines?: ChartLineStyle;
  readonly upDownBars?: import('./plot-decorations.ts').ChartUpDownBars;
  readonly plotArea?: ChartShapeStyle;
  readonly plots?: readonly SupportedChartModel[];
  readonly status: "supported";
  readonly kind: ChartKind;
  readonly sourceType?: string;
  readonly varyColors?: boolean;
  readonly dataLabels?: import('./data-labels.ts').ChartDataLabels;
  readonly threeD?: import('./three-d-properties.ts').ChartView3D;
  readonly walls?: import('./three-d-properties.ts').ChartWalls;
  readonly gapDepth?: number;
  readonly barShape?: import('./bar-shapes.ts').ChartBarShape;
  readonly radarStyle?: 'standard' | 'marker' | 'filled';
  readonly bandFormats?: readonly import('./surface-bands.ts').ChartSurfaceBand[];
  readonly wireframe?: boolean;
  readonly splitType?: 'pie' | 'bar';
  readonly splitBy?: 'auto' | 'cust' | 'percent' | 'pos' | 'val';
  readonly splitPosition?: number;
  readonly customSplit?: readonly number[];
  readonly secondPieSize?: number;
  readonly firstSliceAngle?: number;
  readonly grouping: "clustered" | "stacked" | "percent-stacked" | "standard";
  /** Bar-width percentages, independent of the chart frame size. */
  readonly gapWidth?: number;
  readonly overlap?: number;
  readonly holeSize: number | undefined;
  readonly scatterStyle?: ChartScatterStyle;
  readonly bubbleScale?: number;
  readonly showNegativeBubbles?: boolean;
  readonly bubbleSizeRepresentation?: ChartBubbleSizeRepresentation;
  readonly bubble3D?: boolean;
  readonly axisIds?: readonly number[];
  readonly series: readonly ChartSeries[];
  readonly axes: readonly ChartAxis[];
}

export interface UnsupportedChartModel extends ChartModelBase {
  readonly status: "unsupported";
  readonly chartType: string | undefined;
  readonly reason: string;
}

export type ChartModel = SupportedChartModel | UnsupportedChartModel;
