import { resolveDrawingColor } from '@tumblerjs/ooxml';
import type { ChartColor, ChartModel } from "./model.ts";

const DEFAULT_CHART_COLORS: Readonly<Record<string, string>> = { accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A5A5A5', accent4: '#FFC000', accent5: '#5B9BD5', accent6: '#70AD47', lt1: '#FFFFFF', dk1: '#000000', lt2: '#E7E6E6', dk2: '#44546A', bg1: '#FFFFFF', tx1: '#000000', bg2: '#E7E6E6', tx2: '#44546A' };

/** Resolve host theme bindings without replacing the authored chart colour reference. */
export function resolveChartColor(color: ChartColor, model: ChartModel): string | undefined {
  if (color.source) return resolveDrawingColor(color.source, name => model.themeColors?.[name] ?? DEFAULT_CHART_COLORS[name], undefined, () => color.kind === "rgb" ? color.value : undefined);
  const value = color.kind === "rgb" ? color.value : model.themeColors?.[color.value] ?? DEFAULT_CHART_COLORS[color.value];
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
