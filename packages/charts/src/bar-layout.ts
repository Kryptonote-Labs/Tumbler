import type { SupportedChartModel } from "./model.ts";

/** ECMA-376 §21.2.2.75 and §21.2.2.131 express gaps and overlaps in bar widths. */
export function layoutBarBand(model: SupportedChartModel, band: number) {
  const count = Math.max(1, model.series.length);
  const gap = (model.gapWidth ?? 150) / 100;
  const stacked = model.grouping === "stacked" || model.grouping === "percent-stacked";
  const overlap = (model.overlap ?? (stacked ? 100 : 0)) / 100;
  if (!Number.isFinite(band) || band < 0 || !Number.isFinite(gap) || gap < 0 || gap > 5 || !Number.isFinite(overlap) || overlap < -1 || overlap > 1) {
    throw new RangeError("Bar geometry requires finite non-negative space and valid gap/overlap percentages.");
  }
  const thickness = band / (count - (count - 1) * overlap + gap);
  return { thickness, inset: thickness * gap / 2, stride: thickness * (1 - overlap) };
}
