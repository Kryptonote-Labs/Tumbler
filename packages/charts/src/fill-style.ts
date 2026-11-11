import type { ChartShapeStyle } from './model.ts';

/** Fill is a choice: an explicit solid, gradient or no-fill replaces inherited paint as a unit. */
export function mergeChartFillLayers<T extends ChartShapeStyle>(layers: readonly (T | undefined)[]): T | undefined {
  let result: T | undefined;
  for (const layer of layers) {
    if (!layer) continue;
    if (!result) { result = layer; continue; }
    if (layer.fill || layer.gradient || layer.picture || layer.noFill !== undefined) {
      const { fill, gradient, picture, noFill, ...rest } = result;
      result = { ...rest, ...layer };
    } else result = { ...result, ...layer };
  }
  return result;
}
