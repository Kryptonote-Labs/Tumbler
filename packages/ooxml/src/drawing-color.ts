import { DRAWING_PRESET_COLORS } from './preset-colors.ts';
import type { LosslessXmlElement } from "./xml/source-document.ts";
type RGB = [number, number, number];
const clamp = (v: number) => Math.max(0, Math.min(1, v));
function hsl([r, g, b]: RGB): RGB {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min,
    l = (max + min) / 2;
  if (!d) return [0, 0, l];
  return [
    (max === r
      ? (g - b) / d + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4) / 6,
    d / (1 - Math.abs(2 * l - 1)),
    l,
  ];
}
function rgb([h, s, l]: RGB): RGB {
  h = ((h % 1) + 1) % 1;
  s = clamp(s);
  l = clamp(l);
  const a = s * Math.min(l, 1 - l),
    f = (n: number) => {
      const k = (n + h * 12) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
  return [f(0), f(8), f(4)];
}
const srgb = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
const linear = (v: number) =>
  v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const attr = (e: LosslessXmlElement, n: string) =>
  e.attributes.find((a) => a.namespaceUri === "" && a.localName === n)?.value;
const numeric = (value: string | undefined) => {
  const n = value?.endsWith("%") ? Number(value.slice(0, -1)) * 1000 : Number(value ?? 0);
  if (!Number.isFinite(n)) throw new Error("Invalid colour value.");
  return n;
};
function parse(
  value: string | undefined,
): { rgb: RGB; alpha: number } | undefined {
  if (!value) return;
  const hex = value.replace(/^#/, "");
  if (/^[a-f\d]{6}$/i.test(hex))
    return {
      rgb: [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
      ],
      alpha: 1,
    };
  const rgba = /^rgba\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)$/.exec(value);
  if (rgba)
    return {
      rgb: [
        Number(rgba[1]) / 255,
        Number(rgba[2]) / 255,
        Number(rgba[3]) / 255,
      ],
      alpha: Number(rgba[4]),
    };
}
/** Resolve source colour transforms in order, including HSL luminance and opacity. */
export function resolveDrawingColor(
  element: LosslessXmlElement | undefined,
  scheme: (name: string) => string | undefined,
  placeholder?: string,
  systemColor?: (name: string) => string | undefined,
): string | undefined {
  const node = element?.children.find(
    (n): n is LosslessXmlElement =>
      n.kind === "element" &&
      [
        "srgbClr",
        "scrgbClr",
        "hslClr",
        "schemeClr",
        "sysClr",
        "prstClr",
      ].includes(n.localName),
  );
  if (!node) return;
  let base = parse(
    node.localName === "schemeClr"
      ? attr(node, "val") === "phClr"
        ? placeholder
        : scheme(attr(node, "val") ?? "")
      : node.localName === "sysClr"
        ? attr(node, "lastClr") ?? systemColor?.(attr(node, "val") ?? "")
        : node.localName === "prstClr"
          ? DRAWING_PRESET_COLORS[attr(node, "val") ?? ""]
          : attr(node, "val"),
  );
  if (node.localName === "scrgbClr")
    base = {
      rgb: ["r", "g", "b"].map((key) =>
        srgb(numeric(attr(node, key)) / 100000),
      ) as RGB,
      alpha: 1,
    };
  if (node.localName === "hslClr")
    base = {
      rgb: rgb([
        numeric(attr(node, "hue")) / 21600000,
        numeric(attr(node, "sat")) / 100000,
        numeric(attr(node, "lum")) / 100000,
      ]),
      alpha: 1,
    };
  if (!base) return;
  let color = base.rgb,
    alpha = base.alpha;
  for (const tr of node.children) {
    if (tr.kind !== "element") continue;
    const name = tr.localName,
      n = numeric(attr(tr, "val")),
      v = n / 100000;
    if (name.startsWith("alpha"))
      alpha =
        name === "alpha" ? v : name === "alphaMod" ? alpha * v : alpha + v;
    else if (name === "tint" || name === "shade")
      color = color.map((channel) =>
        name === "tint" ? channel * v + 1 - v : channel * v,
      ) as RGB;
    else if (/^(hue|sat|lum)(Mod|Off)?$/.test(name)) {
      const result = hsl(color),
        index = name.startsWith("hue") ? 0 : name.startsWith("sat") ? 1 : 2;
      const amount = index === 0 && !name.endsWith("Mod") ? n / 21600000 : v;
      result[index] = name.endsWith("Mod")
        ? result[index] * amount
        : name.endsWith("Off")
          ? result[index] + amount
          : amount;
      color = rgb(result);
    } else if (/^(red|green|blue)(Mod|Off)?$/.test(name)) {
      const index = name.startsWith("red")
        ? 0
        : name.startsWith("green")
          ? 1
          : 2;
      color[index] = clamp(
        name.endsWith("Mod")
          ? color[index] * v
          : name.endsWith("Off")
            ? color[index] + v
            : v,
      );
    } else if (name === "comp") {
      const result = hsl(color);
      result[0] += 0.5;
      color = rgb(result);
    } else if (name === "inv")
      color = color.map((channel) => 1 - channel) as RGB;
    else if (name === "gray") {
      const g = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
      color = [g, g, g];
    } else if (name === "gamma" || name === "invGamma")
      color = color.map(name === "gamma" ? srgb : linear) as RGB;
    else throw new Error(`Unsupported colour transform ${name}.`);
    color = color.map(clamp) as RGB;
    alpha = clamp(alpha);
  }
  return `rgba(${color.map((v) => Math.round(clamp(v) * 255)).join(",")},${Math.round(clamp(alpha) * 100000) / 100000})`;
}
