import { ThemeColorScheme, type ThemeColorSlot } from "@tumblerjs/ooxml";

/** A theme selection retains its identity and an RGB fallback for consumers without a theme. */
export interface WordThemeColour {
  readonly theme: ThemeColorSlot;
  readonly fallback: string;
  /** WordprocessingML byte values, 0–255. Tint retains this fraction of the original luminance. */
  readonly tint?: number;
  readonly shade?: number;
}
export type WordColour = string | WordThemeColour;
const slots = [
  "lt1",
  "dk1",
  "lt2",
  "dk2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
] as const;
export { DEFAULT_OFFICE_THEME as DEFAULT_WORD_THEME } from '@tumblerjs/ooxml';
import { DEFAULT_OFFICE_THEME as DEFAULT_WORD_THEME } from '@tumblerjs/ooxml';
export function isWordColour(value: unknown): value is WordColour {
  if (typeof value === "string") return /^#[0-9a-f]{6}$/i.test(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).every((k) =>
      ["theme", "fallback", "tint", "shade"].includes(k),
    ) &&
    slots.some((s) => s === v.theme) &&
    typeof v.fallback === "string" &&
    /^#[0-9a-f]{6}$/i.test(v.fallback) &&
    ["tint", "shade"].every(
      (k) =>
        v[k] === undefined ||
        (typeof v[k] === "number" &&
          Number.isInteger(v[k]) &&
          Number(v[k]) >= 0 &&
          Number(v[k]) <= 255),
    )
  );
}
/** Word applies tint/shade to HSL luminance (MS-OI29500 §17.3.2.6). */
export function wordColourLuminance(
  hex: string,
  multiplier: number,
  offset = 0,
): string {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const hi = Math.max(...rgb),
    lo = Math.min(...rgb),
    delta = hi - lo,
    light = (hi + lo) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
  const next = Math.max(0, Math.min(1, light * multiplier + offset));
  const chroma = (1 - Math.abs(2 * next - 1)) * saturation;
  return (
    "#" +
    rgb
      .map((c) =>
        Math.round(
          255 *
            (delta === 0
              ? next
              : ((c - lo) / delta) * chroma + next - chroma / 2),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function resolveWordColour(
  value: WordColour,
  scheme?: ThemeColorScheme,
): string {
  if (typeof value === "string") return value;
  const base = scheme?.color(value.theme);
  if (!base) return value.fallback;
  let result = "#" + base;
  if (value.tint === undefined && value.shade !== undefined)
    result = wordColourLuminance(result, value.shade / 255);
  if (value.tint !== undefined)
    result = wordColourLuminance(
      result,
      value.tint / 255,
      1 - value.tint / 255,
    );
  return result;
}
/** Resolve presentation values without discarding the authored theme references. */
export function resolveWordPaintProperties<
  T extends {
    readonly shading?: WordColour;
    readonly borders?: import("./table-format.ts").WordTableBorders;
  },
>(format: T, scheme: ThemeColorScheme) {
  const { shading, borders, ...rest } = format;
  return {
    ...rest,
    ...(shading === undefined
      ? {}
      : { shading: resolveWordColour(shading, scheme) }),
    ...(borders === undefined
      ? {}
      : {
          borders: Object.fromEntries(
            Object.entries(borders).map(([side, border]) => [
              side,
              { ...border, color: resolveWordColour(border.color, scheme) },
            ]),
          ),
        }),
  };
}

/** Theme identity includes its transforms; the RGB fallback is only a rendering aid. */
export function wordColoursEqual(
  left: WordColour | undefined,
  right: WordColour | undefined,
): boolean {
  if (typeof left === "string" && typeof right === "string")
    return left.toLowerCase() === right.toLowerCase();
  if (!left || !right) return left === right;
  return (
    typeof left !== "string" &&
    typeof right !== "string" &&
    left.theme === right.theme &&
    (left.tint ?? 255) === (right.tint ?? 255) &&
    (left.shade ?? 255) === (right.shade ?? 255)
  );
}
