export type ChartKind = "bar" | "column" | "line" | "pie" | "doughnut";

export type ChartColor =
  | { readonly kind: "rgb"; readonly value: string }
  | { readonly kind: "scheme"; readonly value: string };

export interface ChartDataPoint {
  readonly index: number;
  readonly value: string | number;
}

export interface ChartDataSequence {
  readonly kind: "number" | "string";
  readonly formula: string | undefined;
  readonly formatCode: string | undefined;
  readonly points: readonly ChartDataPoint[];
}

export interface ChartSeries {
  readonly index: number;
  readonly order: number;
  readonly title: string | undefined;
  readonly titleFormula: string | undefined;
  readonly categories: ChartDataSequence | undefined;
  readonly values: ChartDataSequence | undefined;
  readonly fill: ChartColor | undefined;
  readonly line: ChartColor | undefined;
}

export type ChartLegendPosition = "bottom" | "left" | "right" | "top" | "top-right";

export interface ChartLegend {
  readonly position: ChartLegendPosition;
  readonly overlay: boolean;
}

export interface ChartAxis {
  readonly id: number;
  readonly kind: "category" | "value";
  readonly position: "bottom" | "left" | "right" | "top";
  readonly title: string | undefined;
  readonly majorGridlines: boolean;
  readonly minimum: number | undefined;
  readonly maximum: number | undefined;
  readonly deleted: boolean;
}

interface ChartModelBase {
  readonly title: string | undefined;
  readonly legend: ChartLegend | undefined;
}

export interface SupportedChartModel extends ChartModelBase {
  readonly status: "supported";
  readonly kind: ChartKind;
  readonly grouping: "clustered" | "stacked" | "percent-stacked" | "standard";
  readonly holeSize: number | undefined;
  readonly series: readonly ChartSeries[];
  readonly axes: readonly ChartAxis[];
}

export interface UnsupportedChartModel extends ChartModelBase {
  readonly status: "unsupported";
  readonly chartType: string | undefined;
  readonly reason: string;
}

export type ChartModel = SupportedChartModel | UnsupportedChartModel;
