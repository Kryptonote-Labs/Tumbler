import { axisTickText } from './axis-tick-text.ts';
import { xyAxisPosition } from './axis-positions.ts';
import { chartAxisFormat } from './axis-labels.ts';
import { xyGeometry } from './xy-geometry.ts';
import { chartFont, type ChartFont } from './scene-style.ts';
import { chartTickLabel } from './tick-label.ts';
import { chartMarksBounds } from './shape-scene.ts';
import type { ChartRect, ScatterChartLayout } from './layout.ts';
import type { SupportedChartModel } from './model.ts';
import type { ChartSceneOptions } from './scene-marks.ts';

/** Automatic XY frames reserve the same rotated, formatted tick text that the renderer paints. */
export function fitXYAxisLabels(
  model: SupportedChartModel,
  input: ScatterChartLayout,
  measure: (text: string, font: ChartFont) => number,
  options: ChartSceneOptions,
  limits: ChartRect,
): ChartRect {
  if (model.plotLayout) return input.plot;
  let plot = input.plot;
  for (let pass = 0; pass < 8; pass++) {
    const layout = { ...input, plot },
      geometry = xyGeometry(model, layout);
    let left = 0,
      right = 0,
      top = 0,
      bottom = 0;
    for (const horizontal of [true, false]) {
      const { axis, side, edge } = xyAxisPosition(model, layout, horizontal);
      if (axis?.deleted || axis?.tickLabelPosition === 'none') continue;
      const font = chartFont('tick', axis?.textStyle, model, options.resolveColor);
      const ticks = horizontal ? layout.xTicks : layout.yTicks;
      for (const tick of ticks) {
        const position = horizontal ? geometry.x(tick) : geometry.y(tick);
        const text = chartTickLabel(
          tick / (axis?.displayUnit ?? 1),
          chartAxisFormat(model, axis, horizontal ? 'xValues' : 'values'),
          { ...options, dateSystem: options.dateSystem ?? model.dateSystem ?? '1900' },
        );
        const marks = axisTickText(
          { measure },
          axis,
          horizontal
            ? {
                kind: 'text',
                text,
                x: position,
                y: edge + (side > 0 ? font.size + 5 : -5),
                anchor: 'middle',
                font,
              }
            : {
                kind: 'text',
                text,
                x: edge + side * 6,
                y: position + font.size * 0.3,
                anchor: side > 0 ? 'start' : 'end',
                font,
              },
          horizontal,
          side,
        );
        const bounds = chartMarksBounds({ measure }, marks);
        if (!bounds) continue;
        left = Math.max(left, limits.x - bounds.x);
        right = Math.max(right, bounds.x + bounds.width - limits.x - limits.width);
        top = Math.max(top, limits.y - bounds.y);
        bottom = Math.max(bottom, bounds.y + bounds.height - limits.y - limits.height);
      }
    }
    if (Math.max(left, right, top, bottom) < 0.01) break;
    const xFactor = Math.min(1, Math.max(0, plot.width - 1) / (left + right || 1));
    const yFactor = Math.min(1, Math.max(0, plot.height - 1) / (top + bottom || 1));
    plot = {
      x: plot.x + left * xFactor,
      y: plot.y + top * yFactor,
      width: plot.width - (left + right) * xFactor,
      height: plot.height - (top + bottom) * yFactor,
    };
  }
  return plot;
}
