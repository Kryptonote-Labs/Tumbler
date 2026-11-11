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
  ChartShapeStyle,
  ChartLineStyle,
  ChartColorTransform,
  ChartAxis,
  ChartBubbleSizeRepresentation,
  ChartColor,
  ChartDataPoint,
  ChartDataSequence,
  ChartKind,
  ChartLegend,
  ChartLegendEntry,
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
export type { ChartColorResolver, ChartFont, ChartStroke, ChartStrokeDecoration, ChartTextRole } from "./scene-style.ts";
export { paintChartScene, type ChartCanvasContext, type ChartCanvasOptions } from "./canvas.ts";

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
export { readChartResources, parseChartResources, isChartResources } from './resources.ts';
export type { ChartResources, ChartResourcePart, ChartResourceRelationship } from './resources.ts';
export { chartResourcesSchema } from './resource-schema.ts';
export { bindChartData } from './data-binding.ts';
export { bindChartTheme } from './theme.ts';
export { editChartSeries } from './series-edit.ts';
export type { ChartSeriesEdit } from './series-edit.ts';

export type { ChartDataLabels, ChartDataLabelOptions } from './data-labels.ts';

export type { ChartTrendline, ChartErrorBars } from './analytics-parser.ts';
export { fitChartTrendline, type ChartTrendFit, type TrendPoint } from './trendline.ts';
export { chartErrorExtents, type ChartErrorExtent } from './error-bars.ts';

export { convertChartConformance } from './conformance.ts';

export type { ChartGradient } from './model.ts';
export type { ChartGradientPaint } from './gradient-scene.ts';

export type { ChartUpDownBars } from './plot-decorations.ts';

export type { ChartSurfaceBand } from './surface-bands.ts';

export { CHART_BAR_SHAPES, type ChartBarShape } from './bar-shapes.ts';
export { readChart3DProperties } from './three-d-properties.ts';
export { readChartModel, bindChartImages } from './picture-binding.ts';
export type { ChartPictureFill, ChartImage } from './picture-parser.ts';
export type { ChartPicturePaint } from './fill-scene.ts';
export { chartScenePictures } from './fill-scene.ts';
export { setChartPictureFill, canSetChartPicture } from './picture-edit.ts';
export type { ChartView3D, ChartWall, ChartWalls } from './three-d-properties.ts';
export { readChartFill, setChartPatternFill, setChartNoFill, clearChartFill } from './pattern-edit.ts';
export { DRAWING_PATTERN_PRESETS, type DrawingPatternPreset } from '@tumblerjs/ooxml';

export { readChartGradientFill, editChartGradientFill, setChartSolidFill, type ChartGradientEdit, type ChartGradientType } from './gradient-edit.ts';
export { chartColorOpacity } from './chart-color-markup.ts';

export { editChartFill, type ChartFillEdit } from './fill-edit.ts';

export { mergeChartFillDraft, type ChartFillSnapshot } from './fill-draft.ts';

export type { ChartManualLayout } from './manual-layout.ts';
