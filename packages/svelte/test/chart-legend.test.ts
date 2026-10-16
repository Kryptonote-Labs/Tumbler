import { expect, test } from "bun:test";
import type { SupportedChartModel } from "@tumblerjs/charts";
import { chartLegendPositions } from "../src/chart-legend.ts";

const model: SupportedChartModel = { status: "supported", kind: "column", grouping: "clustered", title: undefined, holeSize: undefined, legend: { position: "bottom", overlay: false }, series: [], axes: [] };

test("horizontal legends centre the union of measured swatches and unequal labels", () => {
  for (const width of [400, 576, 900]) {
    const widths = [50, 100, 65];
    const positions = chartLegendPositions(widths, { model, width, height: 336 });
    expect((positions[0]!.x + positions[2]!.x + widths[2]!) / 2).toBeCloseTo(width / 2);
    expect(positions[1]!.x - positions[0]!.x - widths[0]!).toBe(12);
    expect(positions.every(p => p.y === 320)).toBe(true);
  }
});

test("top legends clear the title and side legends retain their authored edge", () => {
  const top = { ...model, title: "Title", legend: { position: "top" as const, overlay: false } };
  expect(chartLegendPositions([40, 60], { model: top, width: 400, height: 300 })[0]?.y).toBe(48);
  const right = { ...model, legend: { position: "right" as const, overlay: false } };
  const points = chartLegendPositions([40, 60], { model: right, width: 400, height: 300 });
  expect(points[0]?.x).toBe(332);
  expect(points[1]!.y - points[0]!.y).toBe(20);
});
