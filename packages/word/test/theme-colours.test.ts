import { describe, expect, test } from "bun:test";
import { ThemeColorScheme } from "@tumblerjs/ooxml";
import {
  createWordArtifact,
  importWordContent,
  NativeWordDocument,
  DEFAULT_WORD_THEME,
  resolveWordColour,
  wordThemePalette,
  type WordColour,
  type WordThemeColour,
} from "../src/index.ts";
import { validateAttributes } from "../src/collaboration/formatting.ts";
import { wordColourAttributes } from "../src/theme-colour-xml.ts";

const theme = new ThemeColorScheme(
  "Custom",
  new Map([
    ["accent1", "4F81BD"],
    ["accent2", "C0504D"],
  ]),
);
const colour: WordThemeColour = {
  theme: "accent1",
  tint: 153,
  fallback: "#95b3d7",
};

describe("document theme colours", () => {
  test("matches the Microsoft HSL tint example and validates untrusted selections", () => {
    expect(resolveWordColour(colour, theme).toLowerCase()).toBe("#95b3d7");
    expect(resolveWordColour({ ...colour, shade: 64 }, theme)).toBe(
      resolveWordColour(colour, theme),
    );
    expect(wordColourAttributes(colour)).toBe(
      'w:val="95B3D7" w:themeColor="accent1" w:themeTint="99"',
    );
    expect(() => validateAttributes({ color: colour })).not.toThrow();
    expect(() =>
      validateAttributes({ color: { ...colour, tint: -1 } }),
    ).toThrow();
    expect(() =>
      validateAttributes({ color: { ...colour, theme: 'bad"' } }),
    ).toThrow();
    expect(() =>
      validateAttributes({ color: { ...colour, fallback: "red" } }),
    ).toThrow();
  });
  test("builds the palette from the document, retaining theme identity even for duplicate RGB values", () => {
    const palette = wordThemePalette(theme);
    expect(palette.theme).toHaveLength(10);
    expect(palette.variations).toHaveLength(50);
    expect(resolveWordColour(palette.theme[4]!.value, theme)).toBe("#4F81BD");
    expect(palette.variations[24]!.value).toEqual(colour);
    expect(wordThemePalette().theme[4]!.value).toEqual({
      theme: "accent1",
      fallback: "#156082",
    });
  });
  test("preserves themed text, shapes, shading and borders through export and reopen", () => {
    const border = { style: "single" as const, widthPoints: 1, color: colour };
    const model = new NativeWordDocument({ themeColours: theme });
    model.update([
      {
        kind: "paragraph",
        paragraph: { shading: colour, borders: { bottom: border } },
        runs: [
          { text: "Themed", format: { color: colour } },
          {
            text: "\uFFFC",
            shape: {
              preset: "rect",
              width: 30,
              height: 20,
              fill: colour,
              outline: colour,
              outlineWidth: 1,
            },
          },
        ],
      },
      {
        kind: "table",
        rows: [
          [
            {
              format: { shading: colour, borders: { bottom: border } },
              blocks: [{ kind: "paragraph", runs: [{ text: "Cell" }] }],
            },
          ],
        ],
      },
    ]);
    const first = model.blocks[0];
    if (first?.kind !== "paragraph" || first.inlines[0]?.kind !== "run")
      throw new Error("Missing text");
    expect(model.runFormat(first, first.inlines[0]).color.toLowerCase()).toBe(
      "#95b3d7",
    );
    expect(model.paragraphFormat(first).shading?.toLowerCase()).toBe("#95b3d7");
    const artifact = model.artifact();
    const imported = importWordContent(artifact);
    const paragraph = imported[0];
    if (paragraph?.kind !== "paragraph") throw new Error("Missing paragraph");
    expect(paragraph.runs[0]?.format?.color).toEqual({
      ...colour,
      fallback: "#95b3d7",
    });
    expect(paragraph.runs[1]?.shape?.fill).toEqual(colour);
    expect(paragraph.paragraph?.shading).toEqual(colour);
    expect(paragraph.paragraph?.borders?.bottom?.color).toEqual(colour);
    const table = artifact.document.blocks[1];
    if (table?.kind !== "table") throw new Error("Missing table");
    expect(table.rows[0]?.cells[0]?.shading).toEqual(colour);
    expect(table.rows[0]?.cells[0]?.borders?.bottom?.color).toEqual(colour);
    const reopened = new NativeWordDocument({ source: artifact });
    reopened.update(imported);
    const updated = reopened.artifact();
    expect(updated.document.source.source).toContain('w:themeTint="99"');
    expect(updated.document.source.source).toContain("a:schemeClr");
  });
  test("changing the theme changes theme colours but leaves explicit RGB colours alone", () => {
    const changed = new ThemeColorScheme(
      "Changed",
      new Map([["accent1", "196B24"]]),
    );
    const paint = (color: WordColour, themeColours: ThemeColorScheme) => {
      const model = new NativeWordDocument({ themeColours });
      model.update([
        { kind: "paragraph", runs: [{ text: "Text", format: { color } }] },
      ]);
      const paragraph = model.blocks[0];
      if (
        paragraph?.kind !== "paragraph" ||
        paragraph.inlines[0]?.kind !== "run"
      )
        throw new Error("Missing text");
      return model.runFormat(paragraph, paragraph.inlines[0]).color;
    };
    expect(paint(colour, theme)).not.toBe(paint(colour, changed));
    expect(paint("#95b3d7", theme)).toBe(paint("#95b3d7", changed));
    expect(
      createWordArtifact().document.styles.themeColors?.color("accent1"),
    ).toBe(DEFAULT_WORD_THEME.color("accent1"));
  });
});
