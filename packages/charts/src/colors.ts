import type { ChartColor, ChartModel } from "./model.ts";

/** Resolve host theme bindings without replacing the authored chart colour reference. */
export function resolveChartColor(color: ChartColor, model: ChartModel): string | undefined {
  const value = color.kind === "rgb" ? color.value : model.themeColors?.[color.value];
  return value === undefined ? undefined : transformChartColor(value, color);
}

/** Apply ordered luminance operations without intermediate RGB rounding or loss of hue. */
export function transformChartColor(hex: string, color: ChartColor): string {
  if (!color.transforms?.length) return hex;
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const hi = Math.max(...rgb), lo = Math.min(...rgb), delta = hi - lo;
  const light = (hi + lo) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
  let next = light;
  for (const transform of color.transforms) {
    next = Math.max(0, Math.min(1, transform.kind === "lumMod" ? next * transform.value : next + transform.value));
  }
  const chroma = (1 - Math.abs(2 * next - 1)) * saturation;
  return "#" + rgb.map(c => Math.round(255 * (delta === 0 ? next : (c - lo) / delta * chroma + next - chroma / 2)).toString(16).padStart(2, "0")).join("");
}
