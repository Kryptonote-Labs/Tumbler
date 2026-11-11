import type { DrawingGradient } from '@tumblerjs/ooxml';
import type { ChartGradient } from './model.ts';
import type { ChartRect } from './layout.ts';
import type { SceneContext } from './scene-marks.ts';
import { resolveChartColor } from './colors.ts';

export interface ChartGradientPaint {
  readonly gradient: DrawingGradient;
  readonly bounds: ChartRect;
}

/** Resolve authored gradient stops using the same host colour binding as solid paint. */
export function chartGradientPaint(context: SceneContext, gradient: ChartGradient | undefined, bounds: ChartRect): { readonly fillGradient?: ChartGradientPaint } {
  if (!gradient) return {};
  return { fillGradient: { bounds, gradient: { ...gradient, stops: gradient.stops.map(stop => ({ offset: stop.offset, color: context.options.resolveColor?.(stop.color) ?? resolveChartColor(stop.color, context.model) ?? 'transparent' })) } } };
}
