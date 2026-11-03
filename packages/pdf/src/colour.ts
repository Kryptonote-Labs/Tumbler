import {
  array,
  dictionary,
  integer,
  invalid,
  name,
  number,
  PdfName,
  PdfString,
  PdfStream,
  type PdfDictionary,
  type PdfValue,
  unsupported,
} from "./objects.ts";
import type { PdfSource } from "./source.ts";
import { evaluateFunction } from "./functions.ts";

export interface PdfColourSpace {
  readonly components: number;
  readonly indexed?: boolean;
  readonly pattern?: boolean;
  rgb(values: readonly number[]): readonly [number, number, number];
}
const unit = (value: number) => Math.min(1, Math.max(0, value));
const byte = (value: number) => Math.round(unit(value) * 255);
const rgb = (r: number, g: number, b: number): readonly [number, number, number] => [
  byte(r),
  byte(g),
  byte(b),
];
export const deviceGray: PdfColourSpace = {
  components: 1,
  rgb: (values) => rgb(values[0]!, values[0]!, values[0]!),
};
export const deviceRGB: PdfColourSpace = {
  components: 3,
  rgb: (values) => rgb(values[0]!, values[1]!, values[2]!),
};
export const deviceCMYK: PdfColourSpace = {
  components: 4,
  rgb: (values) =>
    rgb(
      (1 - unit(values[0]!)) * (1 - unit(values[3]!)),
      (1 - unit(values[1]!)) * (1 - unit(values[3]!)),
      (1 - unit(values[2]!)) * (1 - unit(values[3]!)),
    ),
};

/** Resolve resource-scoped colour spaces without conflating component data with display RGB. */
export function colourSpace(
  source: PdfSource,
  value: PdfValue | undefined,
  resources: PdfDictionary,
  depth = 0,
): PdfColourSpace {
  if (depth > 32) return invalid("Cyclic PDF colour-space resource.");
  const resolved = source.resolve(value);
  if (resolved instanceof PdfName) {
    if (resolved.value === "Pattern")
      return {
        components: 0,
        pattern: true,
        rgb: () => invalid("Pattern colours require a pattern resource."),
      };
    if (["DeviceGray", "G"].includes(resolved.value)) return deviceGray;
    if (["DeviceRGB", "RGB"].includes(resolved.value)) return deviceRGB;
    if (["DeviceCMYK", "CMYK"].includes(resolved.value)) return deviceCMYK;
    const spaces = source.resolve(resources.get("ColorSpace"));
    if (!(spaces instanceof Map) || !spaces.has(resolved.value))
      return unsupported(`PDF colour space /${resolved.value} is not defined.`);
    return colourSpace(source, spaces.get(resolved.value), resources, depth + 1);
  }
  const definition = array(resolved),
    kind = name(definition[0]);
  if (kind === "Indexed" || kind === "I") {
    const base = colourSpace(source, definition[1], resources, depth + 1),
      max = integer(definition[2]),
      lookup = source.resolve(definition[3]);
    const bytes =
      lookup instanceof PdfString
        ? lookup.bytes
        : lookup instanceof PdfStream
          ? source.stream(lookup)
          : invalid("Invalid indexed colour table.");
    if (max < 0 || max > 255 || bytes.length < (max + 1) * base.components)
      return invalid("Invalid indexed colour table size.");
    return {
      components: 1,
      indexed: true,
      rgb(values) {
        const index = Math.max(0, Math.min(max, Math.round(values[0]!)));
        return base.rgb(
          Array.from(
            bytes.subarray(index * base.components, (index + 1) * base.components),
            (value) => value / 255,
          ),
        );
      },
    };
  }
  if (kind === "Separation" || kind === "DeviceN") {
    const count = kind === "Separation" ? 1 : array(definition[1]).length,
      alternate = colourSpace(source, definition[2], resources, depth + 1);
    return {
      components: count,
      rgb: (values) => alternate.rgb(evaluateFunction(source, definition[3], values)),
    };
  }
  if (kind === "ICCBased") {
    const profile = dictionary(source.resolve(definition[1]));
    // A supported alternate is explicitly defined by the standard for consumers without ICC processing.
    if (profile.has("Alternate"))
      return colourSpace(source, profile.get("Alternate"), resources, depth + 1);
    const components = integer(profile.get("N"));
    if (components === 1) return deviceGray;
    if (components === 3) return deviceRGB;
    if (components === 4) return deviceCMYK;
    return invalid("ICCBased colour space has invalid component count.");
  }
  if (kind === "CalGray") {
    const params = dictionary(source.resolve(definition[1])),
      gamma = number(params.get("Gamma"), 1);
    return {
      components: 1,
      rgb: (values) => {
        const value = unit(values[0]!) ** gamma;
        return rgb(value, value, value);
      },
    };
  }
  return unsupported(`PDF colour space /${kind} needs its calibrated colour transform.`);
}
export function colourCss(space: PdfColourSpace, components: readonly number[]) {
  if (components.length !== space.components || components.some((value) => !Number.isFinite(value)))
    return invalid("PDF colour operands do not match their colour space.");
  const values = space.rgb(components);
  return `rgb(${values[0]}, ${values[1]}, ${values[2]})`;
}
