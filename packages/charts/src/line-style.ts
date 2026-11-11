import type { ChartLineStyle } from './model.ts';

/** Width, dash and joins inherit independently; explicit line paint replaces inherited paint. */
export function mergeChartLineStyles(layers: readonly (ChartLineStyle | undefined)[]): ChartLineStyle | undefined {
  let result: ChartLineStyle | undefined;
  for (const layer of layers) {
    if (!layer) continue;
    if (layer.color || layer.gradient || layer.noFill) {
      const { color, gradient, noFill, ...inherited } = result ?? {};
      result = { ...inherited, ...layer };
    } else result = { ...result, ...layer };
  }
  return result;
}
