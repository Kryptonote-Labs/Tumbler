import type { ThemeColorSlot, ThemeColorScheme } from "@tumblerjs/ooxml";
import {
  DEFAULT_WORD_THEME,
  isWordColour,
  resolveWordColour,
  type WordColour,
  type WordThemeColour,
} from "./theme-colours.ts";
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
const wordNames: Record<ThemeColorSlot, string> = {
  lt1: "light1",
  dk1: "dark1",
  lt2: "light2",
  dk2: "dark2",
  accent1: "accent1",
  accent2: "accent2",
  accent3: "accent3",
  accent4: "accent4",
  accent5: "accent5",
  accent6: "accent6",
  hlink: "hyperlink",
  folHlink: "followedHyperlink",
};
export function wordThemeSlot(name: string): ThemeColorSlot | undefined {
  const aliases: Partial<Record<string, ThemeColorSlot>> = {
    background1: "lt1",
    text1: "dk1",
    background2: "lt2",
    text2: "dk2",
  };
  return (
    slots.find((slot) => slot === name || wordNames[slot] === name) ??
    aliases[name]
  );
}
export function wordColourAttributes(value: WordColour, fill = false): string {
  if (!isWordColour(value))
    throw new TypeError(
      "Word colour must be six-digit RGB or a valid theme reference.",
    );
  const hex = resolveWordColour(value).slice(1).toUpperCase();
  const prefix = fill ? "themeFill" : "theme";
  return (
    `w:${fill ? "fill" : "val"}="${hex}"` +
    (typeof value === "string"
      ? ""
      : ` w:${fill ? "themeFill" : "themeColor"}="${wordNames[value.theme]}"` +
        (value.tint === undefined
          ? ""
          : ` w:${prefix}Tint="${value.tint.toString(16).padStart(2, "0").toUpperCase()}"`) +
        (value.shade === undefined
          ? ""
          : ` w:${prefix}Shade="${value.shade.toString(16).padStart(2, "0").toUpperCase()}"`))
  );
}
export function drawingColourXml(value: WordColour): string {
  if (!isWordColour(value))
    throw new TypeError(
      "Word colour must be six-digit RGB or a valid theme reference.",
    );
  if (typeof value === "string") return `<a:srgbClr val="${value.slice(1)}"/>`;
  const shade =
    value.tint !== undefined || value.shade === undefined
      ? 1
      : value.shade / 255;
  const tint = value.tint === undefined ? 1 : value.tint / 255;
  return `<a:schemeClr val="${value.theme}"><a:lumMod val="${Math.round(shade * tint * 100000)}"/><a:lumOff val="${Math.round((1 - tint) * 100000)}"/></a:schemeClr>`;
}

export { officeThemeXml as wordThemeXml } from '@tumblerjs/ooxml';

/** Read Word's colour/fill attributes, including the explicit RGB compatibility fallback. */
export function readWordColour(
  element: import("@tumblerjs/ooxml").LosslessXmlElement,
  namespace: string,
  attribute = "val",
  scheme?: ThemeColorScheme,
): WordColour | undefined {
  const get = (name: string) =>
    element.attributes.find(
      (a) => a.namespaceUri === namespace && a.localName === name,
    )?.value;
  const raw = get(attribute),
    fallback =
      raw && /^[0-9a-f]{6}$/i.test(raw) ? "#" + raw.toUpperCase() : undefined;
  const fill = attribute === "fill";
  const slot = wordThemeSlot(get(fill ? "themeFill" : "themeColor") ?? "");
  if (!slot) return fallback;
  const byte = (name: string) => {
    const value = get(name);
    if (value === undefined) return undefined;
    if (!/^[0-9a-f]{2}$/i.test(value))
      throw new TypeError("Invalid theme tint/shade.");
    return parseInt(value, 16);
  };
  const tint = byte(fill ? "themeFillTint" : "themeTint"),
    shade = byte(fill ? "themeFillShade" : "themeShade");
  const reference: WordThemeColour = {
    theme: slot,
    fallback: fallback?.toLowerCase() ?? "#000000",
    ...(tint === undefined ? {} : { tint }),
    ...(shade === undefined ? {} : { shade }),
  };
  return { ...reference, fallback: resolveWordColour(reference, scheme) };
}
