import { expect, test } from "bun:test";
import { cartesianAxisScale, chartAxisTicks, parseOoxmlChart, type ChartAxis } from "../src/index.ts";

const axis: ChartAxis = { id: 1, kind: "value", position: "left", title: undefined, majorGridlines: true, minimum: undefined, maximum: undefined, deleted: false };

test("the sample's 0–5 data gets headroom up to 6 with unit gridlines", () => {
  expect(cartesianAxisScale(0, 5)).toEqual({ minimum: 0, maximum: 6, ticks: [0, 1, 2, 3, 4, 5, 6] });
});

test("negative, mixed, fractional and zero data produce finite ordered axes", () => {
  for (const [low, high] of [[-5, 0], [-2, 5], [0, 0.05], [0, 0]] as const) {
    const scale = cartesianAxisScale(low, high);
    expect(scale.minimum).toBeLessThanOrEqual(low);
    expect(scale.maximum).toBeGreaterThanOrEqual(high);
    expect(scale.maximum).toBeGreaterThan(scale.minimum);
    expect(scale.ticks.every((tick, i) => Number.isFinite(tick) && (i === 0 || tick > scale.ticks[i - 1]!))).toBe(true);
  }
  expect(cartesianAxisScale(0, 1, undefined, true).maximum).toBe(1);
});

test("explicit bounds and major units are never replaced by automatic headroom", () => {
  expect(cartesianAxisScale(1.5, 4.5, { ...axis, minimum: 1.5, maximum: 4.5, majorUnit: 0.5 })).toEqual({ minimum: 1.5, maximum: 4.5, ticks: [1.5, 2, 2.5, 3, 3.5, 4, 4.5] });
  expect(cartesianAxisScale(0, 5, { ...axis, maximum: 5 }).maximum).toBe(5);
});

test("major units survive XML parsing and invalid values are rejected", () => {
  const parse = (value: string) => parseOoxmlChart(new TextEncoder().encode(`<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart/><c:valAx><c:axId val="1"/><c:majorUnit val="${value}"/></c:valAx></c:plotArea></c:chart></c:chartSpace>`), "transitional");
  const model = parse("0.5");
  if (model.status !== "supported") throw Error("Expected chart");
  expect(model.axes[0]?.majorUnit).toBe(0.5);
  for (const value of ["0", "-1", "NaN", "Infinity"]) expect(() => parse(value)).toThrow();
});

test("large explicit bounds retain distinct unit ticks while fractional ticks stay clean", () => {
  expect(chartAxisTicks(1e14, 1e14 + 4, 1)).toEqual([1e14, 1e14 + 1, 1e14 + 2, 1e14 + 3, 1e14 + 4]);
  expect(chartAxisTicks(0, 0.3, 0.1)).toEqual([0, 0.1, 0.2, 0.3]);
});
