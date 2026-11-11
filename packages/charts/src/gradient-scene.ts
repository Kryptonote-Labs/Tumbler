import type { DrawingGradient } from '@tumblerjs/ooxml';
import type { ChartGradient, ChartModel } from './model.ts';
import type { ChartColorResolver } from './scene-style.ts';
import type { ChartRect } from './layout.ts';
import type { SceneContext } from './scene-marks.ts';
import { resolveChartColor } from './colors.ts';

export interface ChartGradientPaint {
  readonly gradient: DrawingGradient;
  readonly bounds: ChartRect;
}
const bindings = new WeakMap<ChartGradient, Map<string, DrawingGradient>>();
export function resolveChartGradient(gradient: ChartGradient, model: ChartModel, resolve?: ChartColorResolver): DrawingGradient {
  const colors = gradient.stops.map(stop => resolve?.(stop.color) ?? resolveChartColor(stop.color, model) ?? 'transparent');
  let cache = bindings.get(gradient);
  if (!cache) { cache = new Map(); bindings.set(gradient, cache); }
  const key = JSON.stringify(colors), previous = cache.get(key);
  if (previous) return previous;
  const result = { ...gradient, stops: gradient.stops.map((stop, index) => ({ offset: stop.offset, color: colors[index]! })) };
  cache.set(key, result); return result;
}

/** Resolve authored gradient stops using the same host colour binding as solid paint. */
export function chartGradientPaint(context: SceneContext, gradient: ChartGradient | undefined, bounds: ChartRect): { readonly fillGradient?: ChartGradientPaint } {
  if (!gradient) return {};
  return { fillGradient: { bounds, gradient: resolveChartGradient(gradient, context.model, context.options.resolveColor) } };
}
