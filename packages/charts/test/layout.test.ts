import { describe, expect, test } from "bun:test";
import { chartSequenceValue, chartValueCoordinate, layoutCartesianChart, layoutPieSlices, pieArcPath, type SupportedChartModel } from "../src/index.ts";

describe("headless chart layout", () => {
  test("derives categories, value bounds, and stable plot geometry", () => {
    const layout = layoutCartesianChart(model(), 600, 400);
    expect(layout.categories).toEqual(["Jan", "Feb", "Mar"]);
    expect(layout.minimum).toBe(-5);
    expect(layout.maximum).toBe(20);
    expect(layout.plot.x).toBeGreaterThan(0);
    expect(layout.plot.width).toBeLessThan(600);
    expect(layout.ticks.every((tick, index) => index === 0 || tick > layout.ticks[index - 1]!)).toBeTrue();
  });

  test("honours explicit value-axis bounds", () => {
    const source = model();
    const layout = layoutCartesianChart({ ...source, axes: [{ id: 1, kind: "value", position: "left", title: undefined, majorGridlines: true, minimum: -10, maximum: 50, deleted: false }] }, 300, 200);
    expect(layout).toMatchObject({ minimum: -10, maximum: 50 });
  });

  test("maps scale endpoints and clamps outliers", () => {
    expect(chartValueCoordinate(0, 0, 100, 20, 200)).toBe(20);
    expect(chartValueCoordinate(100, 0, 100, 20, 200)).toBe(220);
    expect(chartValueCoordinate(25, 0, 100, 20, 200, true)).toBe(170);
    expect(chartValueCoordinate(200, 0, 100, 20, 200)).toBe(220);
  });

  test("reads sparse cached points without shifting their indexes", () => {
    expect(chartSequenceValue(model().series[0]?.values, 1)).toBeUndefined();
    expect(chartSequenceValue(model().series[0]?.values, 2)).toBe(20);
  });

  test("lays out positive pie values as a complete non-overlapping circle", () => {
    const source = model();
    const pie = { ...source, kind: "doughnut" as const, series: [{ ...source.series[0]!, values: { kind: "number" as const, formula: undefined, formatCode: undefined, points: [{ index: 0, value: 1 }, { index: 1, value: 3 }, { index: 2, value: -2 }] } }] };
    const slices = layoutPieSlices(pie);
    expect(slices).toHaveLength(2);
    expect(slices[0]?.startAngle).toBeCloseTo(-Math.PI / 2);
    expect(slices.at(-1)?.endAngle).toBeCloseTo(Math.PI * 3 / 2);
    expect(pieArcPath(50, 50, 40, slices[0]!.startAngle, slices[0]!.endAngle, 20)).toContain("A 20 20");
    expect(pieArcPath(50, 50, 40, 0, Math.PI * 2).match(/A 40 40/g)).toHaveLength(2);
    expect(pieArcPath(50, 50, 40, 0, Math.PI * 2, 20).match(/A 20 20/g)).toHaveLength(2);
  });
});

function model(): SupportedChartModel {
  return {
    status: "supported", kind: "column", grouping: "clustered", holeSize: undefined, title: "Results", legend: { position: "right", overlay: false }, axes: [],
    series: [{ index: 0, order: 0, title: "Actual", titleFormula: undefined, fill: undefined, line: undefined,
      categories: { kind: "string", formula: undefined, formatCode: undefined, points: [{ index: 0, value: "Jan" }, { index: 1, value: "Feb" }, { index: 2, value: "Mar" }] },
      values: { kind: "number", formula: undefined, formatCode: "0", points: [{ index: 0, value: -5 }, { index: 2, value: 20 }] },
    }],
  };
}
