import { chartTitleMarks } from './title-scene.ts';
import { resolveChartColor } from "./colors.ts";
import type { SupportedChartModel } from "./model.ts";
import { cartesianScene } from "./scene-cartesian.ts";
import { combinationScene } from "./scene-combination.ts";
import type { ChartMark, ChartScene, ChartSceneOptions, SceneContext } from "./scene-marks.ts";
import { pieScene } from "./scene-pie.ts";
import { chartFont, chartFontShorthand } from "./scene-style.ts";
import { xyScene } from "./scene-xy.ts";

const PALETTE = ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"] as const;

/** Lays out a supported chart as drawing marks at the given pixel size. */
export function layoutChartScene(model: SupportedChartModel, width: number, height: number, options: ChartSceneOptions = {}): ChartScene {
  const context: SceneContext = {
    model, width, height, options,
    color(series, index, line = false) {
      const authored = line ? series.line ?? series.fill : series.fill ?? series.line;
      const themed = authored ?? { kind: "scheme" as const, value: `accent${index % 6 + 1}` };
      return options.resolveColor?.(themed) ?? resolveChartColor(themed, model) ?? PALETTE[index % PALETTE.length]!;
    },
    measure: (text, font) => options.measureText?.(text, chartFontShorthand(font)) ?? text.length * font.size * 0.55,
  };
  const marks: ChartMark[] = [{ kind: "rect", x: 0.5, y: 0.5, width: Math.max(0, width - 1), height: Math.max(0, height - 1), fill: "#ffffff", stroke: "#d9d9d9" }];
  marks.push(...chartTitleMarks(context));
  marks.push(...(model.plots ? combinationScene(context)
    : model.kind === "pie" || model.kind === "doughnut" ? pieScene(context)
    : model.kind === "scatter" || model.kind === "bubble" ? xyScene(context)
    : cartesianScene(context)));
  return { width, height, label: model.title ?? (model.plots ? "Combination chart" : `${model.kind} chart`), marks };
}
