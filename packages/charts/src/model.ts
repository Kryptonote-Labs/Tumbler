export type ChartKind = "bar" | "column" | "line" | "pie" | "doughnut" | "scatter" | "bubble";

export type ChartScatterStyle = "none" | "line" | "line-marker" | "marker" | "smooth" | "smooth-marker";

export type ChartBubbleSizeRepresentation = "area" | "width";

/** Maximum bubble count accepted by parsing, host binding, and layout. */
export const BUBBLE_CHART_POINT_LIMIT = 10_000;

export type ChartMarkerSymbol = "auto" | "circle" | "dash" | "diamond" | "dot" | "none" | "picture" | "plus" | "square" | "star" | "triangle" | "x";

export interface ChartMarker {
  readonly symbol: ChartMarkerSymbol;
  readonly size: number;
}

export interface ChartColorTransform {
  readonly kind: "lumMod" | "lumOff";
  readonly value: number;
}

export type ChartColor = (
  | { readonly kind: "rgb"; readonly value: string }
  | { readonly kind: "scheme"; readonly value: string }) & {
  readonly transforms?: readonly ChartColorTransform[];
};

export interface ChartTextStyle {
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

export interface ChartLineStyle {
  readonly color?: ChartColor;
  readonly noFill?: boolean;
  /** Width in points. */
  readonly width?: number;
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

export interface ChartSeries {
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
  readonly textStyle?: ChartTextStyle;
  readonly position: ChartLegendPosition;
  readonly overlay: boolean;
}

export interface ChartAxis {
  /** Degrees clockwise; omitted means automatic label layout. */
  readonly labelRotation?: number;
  readonly textStyle?: ChartTextStyle;
  readonly lineStyle?: ChartLineStyle;
  readonly gridlineStyle?: ChartLineStyle;
  readonly id: number;
  readonly kind: "category" | "value";
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
  readonly alignment?: "start" | "center" | "end" | "justify";
  readonly runs: readonly { readonly text: string; readonly style?: ChartTextStyle }[];
}

interface ChartModelBase {
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
  readonly plots?: readonly SupportedChartModel[];
  readonly status: "supported";
  readonly kind: ChartKind;
  readonly grouping: "clustered" | "stacked" | "percent-stacked" | "standard";
  /** Bar-width percentages, independent of the chart frame size. */
  readonly gapWidth?: number;
  readonly overlap?: number;
  readonly holeSize: number | undefined;
  readonly scatterStyle?: ChartScatterStyle;
  readonly bubbleScale?: number;
  readonly showNegativeBubbles?: boolean;
  readonly bubbleSizeRepresentation?: ChartBubbleSizeRepresentation;
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
