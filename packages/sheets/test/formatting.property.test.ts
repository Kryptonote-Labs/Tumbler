import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { openOpcPackage } from "@tumblerjs/opc";
import { formatSpreadsheetCells, openSpreadsheet, openWorksheet } from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const hex = fc.array(fc.constantFrom(..."0123456789ABCDEF"), { minLength: 6, maxLength: 6 }).map((value) => value.join(""));

describe("generated SpreadsheetML formatting", () => {
  test("round-trips generated combinations without changing unrelated styles", () => {
    fc.assert(fc.property(
      fc.record({
        size: fc.integer({ min: 1, max: 72 }),
        bold: fc.boolean(),
        italic: fc.boolean(),
        underline: fc.constantFrom<"none" | "single" | "double">("none", "single", "double"),
        color: hex,
        horizontal: fc.constantFrom<"start" | "center" | "end" | "justify">("start", "center", "end", "justify"),
        vertical: fc.constantFrom<"top" | "center" | "bottom">("top", "center", "bottom"),
      }),
      (format) => {
        const workbook = openSpreadsheet(openOpcPackage(fixture()));
        const saved = formatSpreadsheetCells(workbook, workbook.sheets[0]!, "A1:C3", {
          text: {
            fontSize: { set: format.size },
            bold: { set: format.bold },
            italic: { set: format.italic },
            underline: { set: format.underline },
            color: { set: { type: "rgb", value: `#${format.color}` } },
          },
          block: {
            horizontalAlignment: { set: format.horizontal },
            verticalAlignment: { set: format.vertical },
          },
        });
        const reopened = openSpreadsheet(openOpcPackage(saved));
        const worksheet = openWorksheet(reopened, reopened.sheets[0]!);
        for (const reference of ["A1", "B1", "C1", "A2", "B2", "C2", "A3", "B3", "C3"]) {
          const style = worksheet.cellStyle(reference);
          expect(style.font).toMatchObject({
            size: format.size,
            bold: format.bold,
            italic: format.italic,
            underline: format.underline === "none" ? undefined : format.underline,
            color: { type: "rgb", argb: `FF${format.color}` },
          });
          expect(style.alignment).toMatchObject({
            horizontal: format.horizontal === "start" ? "left" : format.horizontal === "end" ? "right" : format.horizontal,
            vertical: format.vertical,
          });
        }
        expect(worksheet.cellStyle("A1")).toMatchObject({
          numberFormatId: 4,
          fill: { patternType: "solid" },
          border: { bottom: { style: "thin" } },
        });
        expect(worksheet.cellStyle("B1")).toMatchObject({ numberFormatId: 0, fill: { patternType: "none" } });
      },
    ), { numRuns: 100 });
  }, 30_000);

  test("commutes changes to independent properties", () => {
    fc.assert(fc.property(fc.boolean(), fc.boolean(), (bold, italic) => {
      const workbook = openSpreadsheet(openOpcPackage(fixture()));
      const sheet = workbook.sheets[0]!;
      const boldBytes = formatSpreadsheetCells(workbook, sheet, "A1", { text: { bold: { set: bold } } });
      const boldWorkbook = openSpreadsheet(openOpcPackage(boldBytes));
      const boldFirst = openSpreadsheet(openOpcPackage(formatSpreadsheetCells(
        boldWorkbook,
        boldWorkbook.sheets[0]!,
        "A1",
        { text: { italic: { set: italic } } },
      )));
      const italicBytes = formatSpreadsheetCells(workbook, sheet, "A1", { text: { italic: { set: italic } } });
      const italicWorkbook = openSpreadsheet(openOpcPackage(italicBytes));
      const italicFirst = openSpreadsheet(openOpcPackage(formatSpreadsheetCells(
        italicWorkbook,
        italicWorkbook.sheets[0]!,
        "A1",
        { text: { bold: { set: bold } } },
      )));
      expect(openWorksheet(boldFirst, boldFirst.sheets[0]!).cellStyle("A1"))
        .toEqual(openWorksheet(italicFirst, italicFirst.sheets[0]!).cellStyle("A1"));
    }), { numRuns: 20 });
  }, 30_000);
});

function fixture(): Uint8Array {
  return buildWorkbookFixture({
    stylesXml: `<styleSheet xmlns="${namespace}">
      <fonts count="1"><font><name val="Aptos"/><sz val="11"/></font></fonts>
      <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill></fills>
      <borders count="2"><border/><border><bottom style="thin"/></border></borders>
      <cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" numFmtId="0"/><xf fontId="0" fillId="1" borderId="1" numFmtId="4"/></cellXfs>
    </styleSheet>`,
    sheets: [{
      name: "Data",
      sheetId: 1,
      relationshipId: "data",
      xml: `<worksheet xmlns="${namespace}"><sheetData><row r="1"><c r="A1" s="1"><v>1</v></c></row></sheetData></worksheet>`,
    }],
  });
}
