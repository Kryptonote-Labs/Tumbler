import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { normalizeFormattingPatch, type FormattingPatch } from "../src/index.ts";

describe("format-neutral formatting", () => {
  test("normalizes semantic text and block formatting", () => {
    const input: FormattingPatch = {
      text: {
        fontSize: { set: 14.5 },
        fontFamily: { set: " Aptos " },
        bold: { set: false },
        italic: { inherit: true },
        underline: { set: "double" },
        color: { set: { type: "rgb", value: "#c62828" } },
      },
      block: {
        horizontalAlignment: { set: "center" },
        verticalAlignment: { inherit: true },
      },
    };

    expect(normalizeFormattingPatch(input)).toEqual({
      text: {
        fontSize: { set: 14.5 },
        fontFamily: { set: "Aptos" },
        bold: { set: false },
        italic: { inherit: true },
        underline: { set: "double" },
        color: { set: { type: "rgb", value: "#C62828" } },
      },
      block: {
        horizontalAlignment: { set: "center" },
        verticalAlignment: { inherit: true },
      },
    });
    expect(Object.isFrozen(normalizeFormattingPatch(input).text)).toBeTrue();
  });

  test("distinguishes omission, explicit false, and inheritance", () => {
    expect(normalizeFormattingPatch({ text: {} })).toEqual({ text: {} });
    expect(normalizeFormattingPatch({ text: { bold: { set: false } } })).toEqual({ text: { bold: { set: false } } });
    expect(normalizeFormattingPatch({ text: { bold: { inherit: true } } })).toEqual({ text: { bold: { inherit: true } } });
  });

  test.each([
    { text: { fontSize: { set: 0 } } },
    { text: { fontSize: { set: 410 } } },
    { text: { fontFamily: { set: "   " } } },
    { text: { color: { set: { type: "rgb", value: "red" } } } },
    { text: { underline: { set: "wavy" } } },
    { block: { horizontalAlignment: { set: "middle" } } },
  ])("rejects invalid public formatting input", (patch) => {
    expect(() => normalizeFormattingPatch(patch as FormattingPatch)).toThrow();
  });

  test("normalizes generated RGB colors without changing their value", () => {
    const hex = fc.array(fc.constantFrom(..."0123456789abcdef"), { minLength: 6, maxLength: 6 })
      .map((digits) => `#${digits.join("")}`);
    fc.assert(fc.property(hex, (value) => {
      expect(normalizeFormattingPatch({ text: { color: { set: { type: "rgb", value } } } })).toEqual({
        text: { color: { set: { type: "rgb", value: value.toUpperCase() } } },
      });
    }), { numRuns: 2_000 });
  });
});
