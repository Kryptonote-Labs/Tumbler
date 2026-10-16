import { expect, test } from "bun:test";
import { resolveChartColor, type ChartModel } from "../src/index.ts";

test("explicit RGB takes precedence and unknown theme slots remain unresolved", () => {
  const model: ChartModel = { status: "unsupported", chartType: undefined, reason: "fixture", title: undefined, legend: undefined, themeColors: { accent1: "#156082" } };
  expect(resolveChartColor({ kind: "rgb", value: "#112233" }, model)).toBe("#112233");
  expect(resolveChartColor({ kind: "scheme", value: "accent1" }, model)).toBe("#156082");
  expect(resolveChartColor({ kind: "scheme", value: "unknown" }, model)).toBeUndefined();
});
