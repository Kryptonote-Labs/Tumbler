import { cartesianAxisPositions } from "./axis-positions.ts";
import { chartAxisFormat } from "./axis-labels.ts";
import { chartTickLabel } from "./tick-label.ts";
import { chartFont, type ChartFont } from "./scene-style.ts";
import type { CartesianChartLayout } from "./layout.ts";
import type { SupportedChartModel } from "./model.ts";
import type { ChartSceneOptions } from "./scene-marks.ts";

/** Automatic Cartesian frames reserve the formatted value labels, including host number formats. */
export function fitValueAxisLabels(
  model: SupportedChartModel,
  layout: CartesianChartLayout,
  measure: (text: string, font: ChartFont) => number,
  options: ChartSceneOptions,
  limits: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  },
) {
  if (model.plotLayout || model.threeD || model.kind === "radar") return layout.plot;
  const { valueAxis, numericLabelEdge, labelSide, value, horizontal } = cartesianAxisPositions(
    model,
    layout,
  );
  if (!valueAxis || valueAxis.deleted || valueAxis.tickLabelPosition === "none") return layout.plot;
  const font = chartFont("tick", valueAxis.textStyle, model, options.resolveColor);
  const format = chartAxisFormat(model, valueAxis);
  const labelWidth = layout.ticks.reduce(
    (maximum, tick) =>
      Math.max(
        maximum,
        measure(
          chartTickLabel(tick / (valueAxis.displayUnit ?? 1), format, {
            ...options,
            dateSystem: options.dateSystem ?? model.dateSystem ?? "1900",
          }),
          font,
        ),
      ),
    0,
  );
  const angle = ((valueAxis.textStyle?.rotation ?? valueAxis.labelRotation ?? 0) * Math.PI) / 180;
  if (horizontal && !angle) return layout.plot;
  const labelHeight = font.size * 1.2;
  const rotatedWidth =
    Math.abs(Math.cos(angle)) * labelWidth + Math.abs(Math.sin(angle)) * labelHeight;
  const rotatedHeight =
    Math.abs(Math.sin(angle)) * labelWidth + Math.abs(Math.cos(angle)) * labelHeight;
  const positions = layout.ticks.map((tick) => value(tick));
  if (!positions.length) return layout.plot;
  let left = 0,
    right = 0,
    top = 0,
    bottom = 0;
  if (horizontal) {
    left = Math.max(0, limits.left - (Math.min(...positions) - rotatedWidth / 2));
    right = Math.max(0, Math.max(...positions) + rotatedWidth / 2 - limits.right);
    if (labelSide > 0) bottom = Math.max(0, numericLabelEdge + 5 + rotatedHeight - limits.bottom);
    else top = Math.max(0, limits.top - (numericLabelEdge - 5 + font.size * 0.2 - rotatedHeight));
  } else {
    if (labelSide < 0) left = Math.max(0, limits.left - (numericLabelEdge - 6 - rotatedWidth));
    else right = Math.max(0, numericLabelEdge + 6 + rotatedWidth - limits.right);
    if (angle) {
      top = Math.max(
        0,
        limits.top - (Math.min(...positions) - font.size * 0.1 - rotatedHeight / 2),
      );
      bottom = Math.max(
        0,
        Math.max(...positions) - font.size * 0.1 + rotatedHeight / 2 - limits.bottom,
      );
    }
  }
  const xFactor = Math.min(1, Math.max(0, layout.plot.width - 1) / (left + right || 1));
  const yFactor = Math.min(1, Math.max(0, layout.plot.height - 1) / (top + bottom || 1));
  return {
    x: layout.plot.x + left * xFactor,
    width: layout.plot.width - (left + right) * xFactor,
    y: layout.plot.y + top * yFactor,
    height: layout.plot.height - (top + bottom) * yFactor,
  };
}
