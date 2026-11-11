export { cartesianAxisScale, chartAxisTicks, type ChartAxisSpace } from "./axis-scale.ts";
export { layoutBarBand } from "./bar-layout.ts";
export { resolveChartColor, transformChartColor } from "./colors.ts";

/** Headless DrawingML chart semantics shared by all OOXML document families. */
export { BUBBLE_CHART_POINT_LIMIT } from "./model.ts";
export type { ChartParseOptions } from "./parser.ts";
export { ChartParseError, parseOoxmlChart } from "./parser.ts";
export { cartesianStack, chartSequenceValue, chartValueCoordinate, layoutBubbleChart, layoutCartesianChart, layoutPieSlices, layoutScatterChart, pieArcPath, scatterLinePath } from "./layout.ts";
export type { BubbleChartLayout, BubblePoint, CartesianChartLayout, ChartRect, PieSlice, ScatterChartLayout, ScatterPoint } from "./layout.ts";
export type {
  ChartTextStyle,
  ChartLineStyle,
  ChartColorTransform,
  ChartAxis,
  ChartBubbleSizeRepresentation,
  ChartColor,
  ChartDataPoint,
  ChartDataSequence,
  ChartKind,
  ChartLegend,
  ChartLegendPosition,
  ChartMarker,
  ChartMarkerSymbol,
  ChartModel,
  ChartSeries,
  ChartScatterStyle,
  SupportedChartModel,
  UnsupportedChartModel,
} from "./model.ts";

export {layoutCombinationChart} from "./combination.ts";

export { layoutChartScene } from "./scene.ts";
export type { ChartMark, ChartScene, ChartSceneOptions } from "./scene-marks.ts";
export { CHART_STROKE_DEFAULTS, CHART_TEXT_DEFAULTS, chartFont, chartFontShorthand, chartLegendPositions, chartStroke } from "./scene-style.ts";
export type { ChartColorResolver, ChartFont, ChartStroke, ChartTextRole } from "./scene-style.ts";
export { paintChartScene, type ChartCanvasContext } from "./canvas.ts";

export { updateChartTitle } from './title-edit.ts';

export type { ChartTextParagraph } from './model.ts';

export { OOXML_CHART_TYPES, isOoxmlChartType } from './chart-types.ts';
export type { OoxmlChartType } from './chart-types.ts';
export { inspectChartSource, editChartSource } from './source-edit.ts';
export type { ChartSourceNode, ChartSourceEdit } from './source-edit.ts';
export { createOoxmlChart } from './create.ts';
export type { CreateChartOptions, ChartSourceSeries } from './create.ts';
export { readChartData, updateChartData, chartSequenceXml } from './data-edit.ts';
export type { ChartEditableSequence, ChartEditableSeries, ChartEditablePlot } from './data-edit.ts';
export { chartPropertyTree, chartPropertyDefinition, insertChartProperty } from './properties.ts';
export type { ChartPropertyNode, ChartPropertyDefinition, ChartPropertyAttribute } from './properties.ts';
export { convertChartType } from './convert.ts';
export type { ChartTypeChange } from './convert.ts';
export { readChartContent, writeChartContent, addChartContent, chartContentModel, decodeChartWorkbook, mergeChartContent, chartBytesToBase64, chartBase64ToBytes } from './part-content.ts';
export type { ChartContent } from './part-content.ts';
export { bindChartData } from './data-binding.ts';
export { bindChartTheme } from './theme.ts';
export { editChartSeries } from './series-edit.ts';
export type { ChartSeriesEdit } from './series-edit.ts';

export type { ChartDataLabels, ChartDataLabelOptions } from './data-labels.ts';
