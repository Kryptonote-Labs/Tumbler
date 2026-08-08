import { describe, expect, test } from "bun:test";
import { chartSequenceValue, chartValueCoordinate, layoutBubbleChart, layoutCartesianChart, layoutPieSlices, layoutScatterChart, pieArcPath, scatterLinePath, type SupportedChartModel } from "../src/index.ts";

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

  test("pairs sparse scatter coordinates by cache index and uses numeric axes", () => {
    const source = model();
    const scatter: SupportedChartModel = { ...source, kind: "scatter", scatterStyle: "marker", axisIds: [10, 20], axes: [
      { id: 10, kind: "value", position: "bottom", title: undefined, majorGridlines: true, minimum: 0, maximum: 100, deleted: false },
      { id: 20, kind: "value", position: "left", title: undefined, majorGridlines: true, minimum: -20, maximum: 40, deleted: false },
    ], series: [{ ...source.series[0]!, xValues: { kind: "number", formula: undefined, formatCode: undefined, points: [{ index: 0, value: 10 }, { index: 1, value: 50 }, { index: 2, value: 90 }] }, values: { kind: "number", formula: undefined, formatCode: undefined, points: [{ index: 0, value: -10 }, { index: 2, value: 30 }] } }] };
    const layout = layoutScatterChart(scatter, 600, 400);
    expect(layout).toMatchObject({ xMinimum: 0, xMaximum: 100, yMinimum: -20, yMaximum: 40 });
    expect(layout.series[0]?.map(({ index, x, y }) => ({ index, x, y }))).toEqual([{ index: 0, x: 10, y: -10 }, { index: 2, x: 90, y: 30 }]);
    expect(layout.series[0]?.[0]?.plotX).toBeLessThan(layout.series[0]![1]!.plotX);
    expect(scatterLinePath(layout.series[0]!)).toContain(" M ");
  });

  test("smooth scatter paths use cubic curves without bridging gaps", () => {
    const points = [
      { index: 0, x: 1, y: 1, plotX: 10, plotY: 30 },
      { index: 1, x: 2, y: 2, plotX: 20, plotY: 10 },
      { index: 3, x: 4, y: 1, plotX: 40, plotY: 30 },
    ];
    const path = scatterLinePath(points, true);
    expect(path).toContain(" C ");
    expect(path.match(/M /g)).toHaveLength(2);
  });

  test("pairs sparse bubble coordinates and sizes by cache index", () => {
    const source = model();
    const bubble: SupportedChartModel = {
      ...source, kind: "bubble", axisIds: [10, 20], bubbleScale: 100,
      showNegativeBubbles: false, bubbleSizeRepresentation: "area",
      axes: [
        { id: 10, kind: "value", position: "bottom", title: undefined, majorGridlines: true, minimum: 0, maximum: 10, deleted: false },
        { id: 20, kind: "value", position: "left", title: undefined, majorGridlines: true, minimum: 0, maximum: 20, deleted: false },
      ],
      series: [{ ...source.series[0]!,
        xValues: { kind: "number", formula: undefined, formatCode: undefined, points: [{ index: 0, value: 1 }, { index: 1, value: 5 }, { index: 3, value: 9 }] },
        values: { kind: "number", formula: undefined, formatCode: undefined, points: [{ index: 0, value: 2 }, { index: 2, value: 8 }, { index: 3, value: 18 }] },
        bubbleSizes: { kind: "number", formula: undefined, formatCode: undefined, points: [{ index: 0, value: 25 }, { index: 1, value: 16 }, { index: 3, value: 100 }] },
      }],
    };
    const layout = layoutBubbleChart(bubble, 600, 400);
    expect(layout.series[0]?.map(({ index, x, y, size }) => ({ index, x, y, size }))).toEqual([
      { index: 0, x: 1, y: 2, size: 25 },
      { index: 3, x: 9, y: 18, size: 100 },
    ]);
    expect(layout.series[0]?.[0]?.radius).toBeCloseTo(layout.series[0]![1]!.radius / 2);
    expect(layout).toMatchObject({ xMinimum: 0, xMaximum: 10, yMinimum: 0, yMaximum: 20 });
  });

  test("applies width scaling and explicit negative and zero bubble behavior", () => {
    const source = model();
    const bubble: SupportedChartModel = {
      ...source, kind: "bubble", bubbleScale: 200, showNegativeBubbles: true,
      bubbleSizeRepresentation: "width", axisIds: [1, 2],
      axes: [
        { id: 1, kind: "value", position: "bottom", title: undefined, majorGridlines: false, minimum: undefined, maximum: undefined, deleted: false },
        { id: 2, kind: "value", position: "left", title: undefined, majorGridlines: false, minimum: undefined, maximum: undefined, deleted: false },
      ],
      series: [{ ...source.series[0]!,
        xValues: { kind: "number", formula: undefined, formatCode: undefined, points: [{ index: 0, value: 1 }, { index: 1, value: 2 }, { index: 2, value: 3 }] },
        values: { kind: "number", formula: undefined, formatCode: undefined, points: [{ index: 0, value: 1 }, { index: 1, value: 2 }, { index: 2, value: 3 }] },
        bubbleSizes: { kind: "number", formula: undefined, formatCode: undefined, points: [{ index: 0, value: -10 }, { index: 1, value: 0 }, { index: 2, value: 20 }] },
      }],
    };
    const layout = layoutBubbleChart(bubble, 500, 300);
    expect(layout.series[0]?.map(({ negative }) => negative)).toEqual([true, false, false]);
    expect(layout.series[0]?.[0]?.radius).toBeCloseTo(layout.series[0]![2]!.radius / 2);
    expect(layout.series[0]?.[1]?.radius).toBe(0);
    expect(layout.series[0]?.[2]?.radius).toBeCloseTo(Math.min(layout.plot.width, layout.plot.height) * 0.2);
    const hidden = layoutBubbleChart({ ...bubble, showNegativeBubbles: false }, 500, 300);
    expect(hidden.series[0]?.[0]?.radius).toBe(0);
  });

  test("rejects bubble layouts above the rendering resource limit", () => {
    const source = model();
    const points = Array.from({ length: 10_001 }, (_, index) => ({ index, value: index + 1 }));
    const bubble: SupportedChartModel = {
      ...source, kind: "bubble", bubbleScale: 100, showNegativeBubbles: false,
      bubbleSizeRepresentation: "area",
      series: [{ ...source.series[0]!,
        xValues: { kind: "number", formula: undefined, formatCode: undefined, points },
        values: { kind: "number", formula: undefined, formatCode: undefined, points },
        bubbleSizes: { kind: "number", formula: undefined, formatCode: undefined, points },
      }],
    };
    expect(() => layoutBubbleChart(bubble, 500, 300)).toThrow("exceeds 10000 potential points");
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
