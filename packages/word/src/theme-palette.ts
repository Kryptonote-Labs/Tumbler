import { ThemeColorScheme } from "@tumblerjs/ooxml";
import {
  DEFAULT_WORD_THEME,
  resolveWordColour,
  wordColourLuminance,
  type WordColour,
} from "./theme-colours.ts";
export type WordColourSwatch = {
  name: string;
  value: WordColour;
  displayColour?: string;
};
/** Each theme swatch retains the slot and transform used to generate its display colour. */
export function wordThemePalette(scheme = DEFAULT_WORD_THEME) {
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
  ] as const;
  const resolvedScheme = new ThemeColorScheme(
    scheme.name,
    new Map(
      slots.map((slot) => [
        slot,
        scheme.color(slot) ?? DEFAULT_WORD_THEME.color(slot),
      ]),
    ),
  );
  const names = [
    "Background 1",
    "Text 1",
    "Background 2",
    "Text 2",
    "Accent 1",
    "Accent 2",
    "Accent 3",
    "Accent 4",
    "Accent 5",
    "Accent 6",
  ];
  const theme = slots.map((slot, index): WordColourSwatch => ({
    name: names[index]!,
    value: {
      theme: slot,
      fallback: "#" + (scheme.color(slot) ?? DEFAULT_WORD_THEME.color(slot)!),
    },
  }));
  const variations = [0, 1, 2, 3, 4].flatMap((row) =>
    theme.map((base, index): WordColourSwatch => {
      const hex = resolveWordColour(base.value, resolvedScheme);
      const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const luminance = (Math.min(...channels) + Math.max(...channels)) / 2;
      // Office chooses the variation ladder by base luminance, not theme slot.
      // Thresholds also used by LibreOffice's ComplexColor::getIndexForLuminance.
      const steps =
        luminance < 0.5
          ? [0.5, 0.35, 0.25, 0.15, 0.05]
          : luminance > 254.5
            ? [-0.05, -0.15, -0.25, -0.35, -0.5]
            : luminance < 50.5
              ? [0.9, 0.75, 0.5, 0.25, 0.1]
              : luminance > 203.5
                ? [-0.1, -0.25, -0.5, -0.75, -0.9]
                : [0.8, 0.6, 0.4, -0.25, -0.5];
      const step = steps[row]!;
      const byte = Math.round((1 - Math.abs(step)) * 255);
      const reference = {
        theme: slots[index]!,
        fallback: hex,
        ...(step > 0 ? { tint: byte } : { shade: byte }),
      };
      return {
        name: `${base.name}, ${step > 0 ? "lighter" : "darker"} ${Math.round(Math.abs(step) * 100)}%`,
        // Office displays exact percentage steps with truncated RGB channels.
        // WordprocessingML stores a quantized byte, which can differ by one level.
        displayColour: wordColourLuminance(
          hex,
          1 - Math.abs(step),
          Math.max(0, step),
          Math.floor,
        ),
        value: {
          ...reference,
          fallback: resolveWordColour(reference, resolvedScheme),
        },
      };
    }),
  );
  return { theme, variations };
}
