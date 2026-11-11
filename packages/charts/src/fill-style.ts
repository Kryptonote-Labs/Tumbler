import type { ChartShapeStyle } from './model.ts';
import { mergeChartLineStyles } from './line-style.ts';

/** Fill is a choice: an explicit solid, gradient or no-fill replaces inherited paint as a unit. */
export function mergeChartFillLayers<T extends ChartShapeStyle>(layers: readonly (T | undefined)[]): T | undefined {
  let result: T | undefined;
  for (const layer of layers) {
    if (!layer) continue;
    if (!result) { result = layer; continue; }
    const lineStyle = mergeChartLineStyles([result.lineStyle, layer.lineStyle]);
    if (layer.fill || layer.gradient || layer.pattern || layer.picture || layer.noFill !== undefined) {
      const { fill, gradient, pattern, picture, noFill, ...rest } = result;
      result = { ...rest, ...layer };
    } else result = { ...result, ...layer };
    if (lineStyle) result = { ...result, lineStyle };
  }
  return result;
}
