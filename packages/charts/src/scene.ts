import { chartShapeMarks } from './shape-scene.ts';
import { chartStrokeBounds } from './stroke-bounds.ts';
import { ofPieScene } from './scene-of-pie.ts';
import { surfaceScene } from './scene-surface.ts';
import { threeDScene } from './scene-three-d.ts';
import { radarScene } from './scene-radar.ts';
import { stockScene } from './scene-stock.ts';
import { assertChartSceneBudget } from './scene-budget.ts';
import { chartTitleMarks } from './title-scene.ts';
import { chartAxisTitleFrame } from './axis-title-scene.ts';
import { resolveChartColor } from "./colors.ts";
import type { SupportedChartModel, ChartSeries, ChartPointFormat } from "./model.ts";
import { cartesianScene } from "./scene-cartesian.ts";
import { combinationScene } from "./scene-combination.ts";
import type { ChartMark, ChartScene, ChartSceneOptions, SceneContext } from "./scene-marks.ts";
import { layoutCartesianChart, layoutScatterChart } from './layout.ts';
import { pieScene, pieChartFrame } from "./scene-pie.ts";
import { chartFont, chartFontShorthand } from "./scene-style.ts";
import { xyScene } from "./scene-xy.ts";

const PALETTE = ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"] as const;

/** Lays out a supported chart as drawing marks at the given pixel size. */
export function layoutChartScene(model: SupportedChartModel, width: number, height: number, options: ChartSceneOptions = {}): ChartScene {
  try {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) throw new RangeError('Invalid chart size.');
    return buildChartScene(model, width, height, options);
  } catch {
    // Shared by SVG and canvas hosts. Never invoke host callbacks while falling back.
    const safeWidth = Number.isFinite(width) && width > 0 ? width : 1;
    const safeHeight = Number.isFinite(height) && height > 0 ? height : 1;
    return { width: safeWidth, height: safeHeight, label: 'Chart preview unavailable', marks: [
      { kind: 'rect', x: 0, y: 0, width: safeWidth, height: safeHeight, fill: '#f7f7f7' },
      { kind: 'text', text: 'Chart preview unavailable', x: safeWidth / 2, y: safeHeight / 2, anchor: 'middle', font: { family: 'sans-serif', size: 11, weight: 400, italic: false, color: '#666666' } },
    ] };
  }
}

function buildChartScene(model: SupportedChartModel, width: number, height: number, options: ChartSceneOptions): ChartScene {
  assertChartSceneBudget(model);
  const pointStyles = new Map<ChartSeries, ReadonlyMap<number, ChartPointFormat>>();
  const baseContext: SceneContext = {
    model, width, height, options: { ...options, dateSystem: options.dateSystem ?? model.dateSystem ?? "1900" },
    color(series, index, line = false) {
      const authored = line ? series.line ?? series.fill : series.fill ?? series.line;
      const themed = authored ?? { kind: "scheme" as const, value: `accent${index % 6 + 1}` };
      return options.resolveColor?.(themed) ?? resolveChartColor(themed, model) ?? PALETTE[index % PALETTE.length]!;
    },
    pointFormat(series, index) {
      let indexed = pointStyles.get(series);
      if (!indexed) { indexed = new Map(series.pointFormats?.map(point => [point.index, point])); pointStyles.set(series, indexed); }
      return indexed.get(index);
    },
    measure: (text, font) => options.measureText?.(text, chartFontShorthand(font)) ?? text.length * font.size * 0.55,
  };
  const orientedAxes = model.axes.some(axis => axis.titleStyle?.rotation !== undefined || axis.titleText || axis.titleShape) || model.plots?.some(plot => plot.axes.some(axis => axis.titleStyle?.rotation !== undefined || axis.titleText || axis.titleShape));
  const context: SceneContext = orientedAxes ? { ...baseContext, axisTitleFrame: chartAxisTitleFrame(baseContext) } : baseContext;
  const marks: ChartMark[] = chartShapeMarks(context, { x: .5, y: .5, width: Math.max(0, width - 1), height: Math.max(0, height - 1) }, model.chartArea, { fill: '#ffffff', stroke: '#d9d9d9' });
  const titleMarks = chartTitleMarks(context);
  const manual = model.plotLayout;
  const possiblyCollapsed = manual && (manual.width === 0 || manual.height === 0 || manual.widthMode === 'edge' || manual.heightMode === 'edge');
  const plot = possiblyCollapsed ? model.kind === 'pie' || model.kind === 'doughnut' || model.kind === 'of-pie'
    ? pieChartFrame(context).plot
    : model.kind === 'scatter' || model.kind === 'bubble' ? layoutScatterChart(model, width, height, context.measure).plot
    : layoutCartesianChart(model, width, height, context.measure).plot : undefined;
  if (plot && (plot.width <= 0 || plot.height <= 0)) {
    const { plotLayout: _manual, ...automatic } = model;
    marks.push(...chartPlotScene({ ...context, model: automatic }).filter(mark => mark.kind === 'group' && mark.role === 'legend'));
  } else marks.push(...chartPlotScene(context));
  marks.push(...titleMarks);
  return { width, height, label: model.title ?? (model.plots ? "Combination chart" : `${model.kind} chart`), marks: chartStrokeBounds(marks, options.viewport ?? { x: 0, y: 0, width, height }) };
}


function chartPlotScene(context: SceneContext): ChartMark[] {
  const { model } = context;
  return model.plots ? combinationScene(context)
    : model.kind === 'of-pie' ? ofPieScene(context)
    : model.kind === 'pie' || model.kind === 'doughnut' ? pieScene(context)
    : model.kind === 'scatter' || model.kind === 'bubble' ? xyScene(context)
    : model.kind === 'surface' ? surfaceScene(context)
    : model.threeD ? threeDScene(context)
    : model.kind === 'radar' ? radarScene(context)
    : model.kind === 'stock' ? stockScene(context)
    : cartesianScene(context);
}
