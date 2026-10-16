import type { ChartColor, ChartModel } from "./model.ts";

/** Resolve host theme bindings without replacing the authored chart colour reference. */
export function resolveChartColor(color: ChartColor, model: ChartModel): string | undefined {
  let value = color.kind === "rgb" ? color.value : model.themeColors?.[color.value];
  for (const transform of color.transforms ?? []) {
    if (value === undefined) break;
    value = luminance(value, transform.kind === "lumMod" ? transform.value : 1, transform.kind === "lumOff" ? transform.value : 0);
  }
  return value;
}

function luminance(hex: string, multiplier: number, offset: number): string {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const hi = Math.max(...rgb), lo = Math.min(...rgb), delta = hi - lo;
  const light = (hi + lo) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
  const next = Math.max(0, Math.min(1, light * multiplier + offset));
  const chroma = (1 - Math.abs(2 * next - 1)) * saturation;
  return "#" + rgb.map(c => Math.round(255 * (delta === 0 ? next : (c - lo) / delta * chroma + next - chroma / 2)).toString(16).padStart(2, "0")).join("");
}
