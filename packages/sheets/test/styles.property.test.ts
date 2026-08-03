import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { openOpcPackage } from "@tumblerjs/opc";
import { formatSpreadsheetCellValue, openSpreadsheet, readSpreadsheetStyles, type SpreadsheetCellValue } from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const hexColor = fc.array(fc.constantFrom(..."0123456789ABCDEF"), { minLength: 6, maxLength: 6 }).map((digits) => digits.join(""));

describe("generated SpreadsheetML display styles", () => {
  test("resolves generated style indexes deterministically", () => {
    fc.assert(fc.property(
      fc.array(fc.integer({ min: 8, max: 30 }), { minLength: 1, maxLength: 8 }),
      fc.array(hexColor, { minLength: 1, maxLength: 8 }),
      fc.array(fc.constantFrom("thin", "medium", "double", "dashed"), { minLength: 1, maxLength: 8 }),
      fc.array(fc.tuple(fc.nat(), fc.nat(), fc.nat(), fc.integer({ min: 0, max: 4 })), { minLength: 1, maxLength: 20 }),
      (fontSizes, fillColors, borderStyles, records) => {
        const xml = `<styleSheet xmlns="${namespace}">
          <fonts count="${fontSizes.length}">${fontSizes.map((size, index) => `<font><name val="Font${index}"/><sz val="${size}"/>${index % 2 === 0 ? "<b/>" : ""}</font>`).join("")}</fonts>
          <fills count="${fillColors.length}">${fillColors.map((color) => `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/></patternFill></fill>`).join("")}</fills>
          <borders count="${borderStyles.length}">${borderStyles.map((style) => `<border><left style="${style}"/><right/><top/><bottom/></border>`).join("")}</borders>
          <cellXfs count="${records.length}">${records.map(([font, fill, border, decimals]) => `<xf fontId="${font % fontSizes.length}" fillId="${fill % fillColors.length}" borderId="${border % borderStyles.length}" numFmtId="${decimals === 0 ? 1 : 2}"/>`).join("")}</cellXfs>
        </styleSheet>`;
        const styles = readSpreadsheetStyles(openSpreadsheet(openOpcPackage(buildWorkbookFixture({ stylesXml: xml }))));
        expect(styles.cellFormats).toHaveLength(records.length);
        for (const [index, [font, fill, border]] of records.entries()) {
          const resolved = styles.resolve(index);
          expect(resolved.font.name).toBe(`Font${font % fontSizes.length}`);
          expect(resolved.fill.foreground?.type).toBe("rgb");
          expect(resolved.border.left.style).toBe(borderStyles[border % borderStyles.length]);
        }
      },
    ), { numRuns: 150 });
  }, 30_000);

  test("formats generated numeric and date values deterministically", () => {
    fc.assert(fc.property(
      fc.double({ min: -1e12, max: 1e12, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 0, max: 8 }),
      fc.boolean(),
      fc.boolean(),
      (value, decimals, grouping, percent) => {
        const cell: SpreadsheetCellValue = { type: "number", value, lexical: String(value) };
        const code = `${grouping ? "#,##" : ""}0${decimals === 0 ? "" : `.${"0".repeat(decimals)}`}${percent ? "%" : ""}`;
        const first = formatSpreadsheetCellValue(cell, { numberFormatCode: code });
        const second = formatSpreadsheetCellValue(cell, { numberFormatCode: code });
        expect(first).toBe(second);
        expect(first).not.toContain("NaN");
      },
    ), { numRuns: 5_000 });

    fc.assert(fc.property(
      fc.double({ min: 0, max: 2_958_465, noNaN: true, noDefaultInfinity: true }),
      fc.constantFrom<"1900" | "1904">("1900", "1904"),
      (value, dateSystem) => {
        const output = formatSpreadsheetCellValue({ type: "number", value, lexical: String(value) }, {
          numberFormatCode: "yyyy-mm-dd hh:mm:ss",
          dateSystem,
        });
        expect(output).toMatch(/^\d{4,}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      },
    ), { numRuns: 2_000 });
  });
});
