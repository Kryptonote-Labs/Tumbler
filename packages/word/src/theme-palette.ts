import { ThemeColorScheme } from "@tumblerjs/ooxml";
import {
  DEFAULT_WORD_THEME,
  resolveWordColour,
  type WordColour,
} from "./theme-colours.ts";
export type WordColourSwatch = { name: string; value: WordColour };
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
      const steps =
        hex.toLowerCase() === "#ffffff"
          ? [-0.05, -0.15, -0.25, -0.35, -0.5]
          : hex.toLowerCase() === "#000000"
            ? [0.5, 0.35, 0.25, 0.15, 0.05]
            : index === 2
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
        value: {
          ...reference,
          fallback: resolveWordColour(reference, resolvedScheme),
        },
      };
    }),
  );
  return { theme, variations };
}
