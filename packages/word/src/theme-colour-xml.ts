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

export function wordThemeXml(scheme = DEFAULT_WORD_THEME): string {
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = `<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr">${fill}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  return `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"><a:themeElements><a:clrScheme name="Office">${[
    "dk1",
    "lt1",
    "dk2",
    "lt2",
    "accent1",
    "accent2",
    "accent3",
    "accent4",
    "accent5",
    "accent6",
    "hlink",
    "folHlink",
  ]
    .map((name) => {
      const slot = wordThemeSlot(name)!;
      const value = scheme.color(slot) ?? DEFAULT_WORD_THEME.color(slot)!;
      if (!/^[0-9a-f]{6}$/i.test(value))
        throw new TypeError("Invalid theme colour.");
      return `<a:${slot}><a:srgbClr val="${value}"/></a:${slot}>`;
    })
    .join(
      "",
    )}</a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst>${fill.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${line.repeat(3)}</a:lnStyleLst><a:effectStyleLst>${"<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fill.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}

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
