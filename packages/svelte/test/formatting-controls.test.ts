import { describe, expect, test } from "bun:test";
import {
  colorFormatting,
  fontSizeFormatting,
  formattingColorValue,
  toggleBooleanFormatting,
  toggleUnderlineFormatting,
} from "../src/formatting-controls.ts";

describe("formatting toolbar commands", () => {
  test("toggles uniform and mixed boolean values", () => {
    expect(toggleBooleanFormatting("bold", { state: "value", value: true })).toEqual({ text: { bold: { set: false } } });
    expect(toggleBooleanFormatting("italic", { state: "inherited", value: false })).toEqual({ text: { italic: { set: true } } });
    expect(toggleBooleanFormatting("bold", { state: "mixed" })).toEqual({ text: { bold: { set: true } } });
  });

  test("toggles underline and validates direct inputs", () => {
    expect(toggleUnderlineFormatting({ state: "value", value: "single" })).toEqual({ text: { underline: { set: "none" } } });
    expect(toggleUnderlineFormatting({ state: "mixed" })).toEqual({ text: { underline: { set: "single" } } });
    expect(fontSizeFormatting("14.5")).toEqual({ text: { fontSize: { set: 14.5 } } });
    expect(fontSizeFormatting("0")).toBeUndefined();
    expect(colorFormatting("#12abEF")).toEqual({ text: { color: { set: { type: "rgb", value: "#12abEF" } } } });
    expect(colorFormatting("red")).toBeUndefined();
  });

  test("uses effective RGB colors and a safe automatic fallback", () => {
    expect(formattingColorValue({ state: "value", value: { type: "rgb", value: "#123456" } })).toBe("#123456");
    expect(formattingColorValue({ state: "inherited", value: { type: "automatic" } })).toBe("#000000");
    expect(formattingColorValue({ state: "mixed" })).toBe("#000000");
  });
});
