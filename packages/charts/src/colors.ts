import type { ChartColor, ChartModel } from "./model.ts";

/** Resolve host theme bindings without replacing the authored chart colour reference. */
export function resolveChartColor(color: ChartColor, model: ChartModel): string | undefined {
  return color.kind === "rgb" ? color.value : model.themeColors?.[color.value];
}
