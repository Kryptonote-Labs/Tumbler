import { expect, test } from "bun:test";
import { canvasWordTextMeasurer } from "../src/index.ts";

test("canvas measurement converts CSS pixels to points and keeps a run's font box", () => {
  const context = { font: "", direction: "inherit" as const, measureText: (text: string) => ({ width: text.length * 8, fontBoundingBoxAscent: 12, fontBoundingBoxDescent: 4 }) };
  const format = { fontFamily: "Arial", fontSizePoints: 12, bold: false, italic: false, underline: "none" as const, strike: false, color: "#000000", highlight: undefined, verticalAlign: "baseline" as const, rightToLeft: false };
  expect(canvasWordTextMeasurer(context).measure("Hi", format)).toEqual({ width: 12, ascent: 9, descent: 3 });
  expect(context.font).toBe('normal normal 400 16px "Arial", sans-serif');
});

test("canvas measurement shapes each distinct run once", () => {
  let calls = 0;
  const context = { font: "", direction: "inherit" as const, measureText: (text: string) => (calls++, { width: text.length * 8 }) };
  const format = { fontFamily: "Arial", fontSizePoints: 12, bold: false, italic: false, underline: "none" as const, strike: false, color: "#000000", highlight: undefined, verticalAlign: "baseline" as const, rightToLeft: false };
  const measurer = canvasWordTextMeasurer(context);
  for (const text of ["a", "b", "a", "a"]) measurer.measure(text, format);
  measurer.measure("a", { ...format, bold: true });
  expect(calls).toBe(3);
});
