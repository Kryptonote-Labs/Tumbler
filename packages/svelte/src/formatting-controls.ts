import type { FormattingPatch, FormattingValue, OfficeColor, TextUnderline } from "@tumblerjs/core";

export function toggleBooleanFormatting(
  property: "bold" | "italic",
  state: FormattingValue<boolean>,
): FormattingPatch {
  const enabled = state.state === "value" || state.state === "inherited" ? state.value : false;
  return { text: { [property]: { set: !enabled } } };
}

export function toggleUnderlineFormatting(state: FormattingValue<TextUnderline>): FormattingPatch {
  const enabled = (state.state === "value" || state.state === "inherited") && state.value !== "none";
  return { text: { underline: { set: enabled ? "none" : "single" } } };
}

export function fontSizeFormatting(value: string): FormattingPatch | undefined {
  const size = Number(value);
  return Number.isFinite(size) && size >= 1 && size <= 409
    ? { text: { fontSize: { set: size } } }
    : undefined;
}

export function colorFormatting(value: string): FormattingPatch | undefined {
  return /^#[0-9A-Fa-f]{6}$/.test(value)
    ? { text: { color: { set: { type: "rgb", value } } } }
    : undefined;
}

export function formattingColorValue(state: FormattingValue<OfficeColor>): string {
  if ((state.state === "value" || state.state === "inherited") && state.value.type === "rgb") {
    return state.value.value;
  }
  return "#000000";
}
