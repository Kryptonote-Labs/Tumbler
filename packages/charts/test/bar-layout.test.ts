import { expect, test } from "bun:test";
import { layoutBarBand, parseOoxmlChart } from "../src/index.ts";

function chart(gap = "219", overlap = "-27", grouping = "clustered", strict = false) {
  const namespace = strict ? "http://purl.oclc.org/ooxml/drawingml/chart" : "http://schemas.openxmlformats.org/drawingml/2006/chart";
  const bytes = new TextEncoder().encode(`<c:chartSpace xmlns:c="${namespace}"><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:grouping val="${grouping}"/>${[0,1,2].map(i => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/></c:ser>`).join("")}<c:gapWidth val="${gap}"/><c:overlap val="${overlap}"/></c:barChart></c:plotArea></c:chart></c:chartSpace>`);
  const model = parseOoxmlChart(bytes, strict ? "strict" : "transitional");
  if (model.status !== "supported") throw Error("Expected chart");
  return model;
}

test("authored spacing produces a 219% cluster gap and a 27% gap between bars", () => {
  for (const model of [chart(), chart("219%", "-27%", "clustered", true)]) {
    const { thickness, stride, inset } = layoutBarBand(model, 100);
    expect((stride - thickness) / thickness).toBeCloseTo(0.27);
    expect(2 * inset / thickness).toBeCloseTo(2.19);
    expect(2 * inset + 2 * stride + thickness).toBeCloseTo(100);
    expect(layoutBarBand(model, 200).thickness).toBeCloseTo(2 * thickness);
  }
});

test("full overlap shares positions, zero gap fills the band, and overlap remains authored", () => {
  expect(layoutBarBand(chart("0", "100", "stacked"), 100)).toEqual({ thickness: 100, inset: 0, stride: 0 });
  const bars = layoutBarBand(chart("0", "0"), 90);
  expect(bars).toEqual({ thickness: 30, inset: 0, stride: 30 });
  expect(layoutBarBand(chart("150", "50"), 100).stride).toBeCloseTo(layoutBarBand(chart("150", "50"), 100).thickness / 2);
});

test("invalid authored spacing fails parsing rather than producing invalid geometry", () => {
  for (const gap of ["-1", "501", "NaN", ""]) expect(() => chart(gap)).toThrow();
  for (const overlap of ["-101", "101", "Infinity"]) expect(() => chart("219", overlap)).toThrow();
});
