import { expect, test } from "bun:test";
import { cssFontFamily } from "../src/font-family.ts";
test("Office sans fonts keep a sans fallback when unavailable", () => {
  expect(cssFontFamily("Aptos")).toBe('"Aptos", sans-serif');
  expect(cssFontFamily("Calibri")).toBe('"Calibri", sans-serif');
  expect(cssFontFamily("Unknown family")).toBe('"Unknown family", serif');
});
test("serif and monospaced fonts retain their font class", () => {
  expect(cssFontFamily("Times New Roman")).toBe('"Times New Roman", serif');
  expect(cssFontFamily("Source Serif 4")).toBe('"Source Serif 4", serif');
  expect(cssFontFamily("Consolas")).toBe('"Consolas", monospace');
  expect(cssFontFamily("Comic Sans MS")).toBe('"Comic Sans MS", cursive');
});
test("font names are quoted without turning embedded punctuation into other families", () => {
  expect(cssFontFamily('A "special", font')).toBe('"A \\"special\\", font", serif');
});

test("font vendor names do not override their font class", () => {
  expect(cssFontFamily("Microsoft Sans Serif")).toBe('"Microsoft Sans Serif", sans-serif');
  expect(cssFontFamily("Monotype Corsiva")).toBe('"Monotype Corsiva", cursive');
  for (const family of ["Constantia", "Book Antiqua", "Century Schoolbook"])
    expect(cssFontFamily(family)).toBe(`"${family}", serif`);
});
