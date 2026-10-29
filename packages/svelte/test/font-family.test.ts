import { expect, test } from "bun:test";
import { cssFontFamily } from "../src/font-family.ts";
test("Office sans fonts keep a sans fallback when unavailable", () => {
  expect(cssFontFamily("Aptos")).toBe('"Aptos", sans-serif');
  expect(cssFontFamily("Calibri")).toBe('"Calibri", sans-serif');
  expect(cssFontFamily("Unknown family")).toBe('"Unknown family", sans-serif');
});
test("serif and monospaced fonts retain their font class", () => {
  expect(cssFontFamily("Times New Roman")).toBe('"Times New Roman", serif');
  expect(cssFontFamily("Source Serif 4")).toBe('"Source Serif 4", serif');
  expect(cssFontFamily("Consolas")).toBe('"Consolas", monospace');
  expect(cssFontFamily("Comic Sans MS")).toBe('"Comic Sans MS", cursive');
});
test("font names are quoted without turning embedded punctuation into other families", () => {
  expect(cssFontFamily('A "special", font')).toBe('"A \\"special\\", font", sans-serif');
});
