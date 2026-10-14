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
  test("matches Office's variation grid within one RGB level", () => {
    // Column-major RGB samples from the Office screenshot supplied with the bug.
    const columns = [
      "f2f2f2 d8d8d8 bfbfbf a5a5a5 7f7f7f",
      "7f7f7f 595959 3f3f3f 262626 0c0c0c",
      "d0d0d0 aeaeae 747474 3a3a3a 171717",
      "dbe9f7 a6c9eb 4d94d8 215e99 153d64",
      "c1e4f5 83caeb 45b0e1 0f4861 0a3041",
      "fae2d6 f6c6ac f1a984 bf4f14 7f340d",
      "c1f0c8 84e291 47d45a 12501b 0c3512",
      "caedfb 95dcf7 60cbf3 0b769f 074f6a",
      "f1ceee e49edd d76dcc 78206e 501549",
      "d9f2d0 b3e5a1 8ed873 3a7d22 265316",
    ];
    const { variations } = wordThemePalette();
    columns.forEach((column, x) => {
      column.split(" ").forEach((expected, y) => {
        const actual = variations[y * 10 + x]!.displayColour!;
        for (const i of [0, 2, 4]) {
          expect(
            Math.abs(
              parseInt(actual.slice(i + 1, i + 3), 16) -
                parseInt(expected.slice(i, i + 2), 16),
            ),
          ).toBeLessThanOrEqual(1);
        }
        if (x === 3) expect(actual).toBe("#" + expected);
      });
    });
  });
  test("chooses variation steps by luminance even when theme slots change", () => {
    const custom = new ThemeColorScheme(
      "Reordered",
      new Map([
        ["accent1", "0E2841"],
        ["accent2", "E8E8E8"],
        ["lt2", "156082"],
      ]),
    );
    const { variations } = wordThemePalette(custom);
    expect(variations[4]!.name).toBe("Accent 1, lighter 90%");
    expect(variations[44]!.name).toBe("Accent 1, lighter 10%");
    expect(variations[5]!.name).toBe("Accent 2, darker 10%");
    expect(variations[2]!.name).toBe("Background 2, lighter 80%");
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
