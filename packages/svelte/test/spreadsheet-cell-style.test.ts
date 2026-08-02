import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "../../opc/src/index.ts";
import { openSpreadsheet, openWorksheet } from "@tumbler/sheets";
import { buildWorkbookFixture } from "../../sheets/test/workbook-fixture.ts";
import { spreadsheetCellContentCss, spreadsheetCellCss } from "../src/index.ts";

const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

describe("Svelte spreadsheet cell styles", () => {
  test("lets authored font and fill colours override the light canvas defaults", () => {
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      stylesXml: `<styleSheet xmlns="${namespace}"><fonts count="2"><font/><font><color rgb="FFFFFFFF"/></font></fonts><fills count="2"><fill/><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/></patternFill></fill></fills><borders count="1"><border/></borders><cellXfs count="2"><xf/><xf fontId="1" fillId="1" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`,
      sheets: [{
        name: "Sheet1",
        sheetId: 1,
        relationshipId: "sheet1",
        xml: `<worksheet xmlns="${namespace}"><sheetData><row r="1"><c r="A1" s="1" t="inlineStr"><is><t>authored</t></is></c><c r="B1" t="inlineStr"><is><t>default</t></is></c></row></sheetData></worksheet>`,
      }],
    })));
    const worksheet = openWorksheet(workbook, workbook.sheets[0]!);

    expect(spreadsheetCellCss(worksheet, "A1")).toContain("color:#FFFFFF");
    expect(spreadsheetCellCss(worksheet, "A1")).toContain("background-color:#1F4E78");
    expect(spreadsheetCellCss(worksheet, "B1")).not.toContain("color:");
    expect(spreadsheetCellCss(worksheet, "B1")).not.toContain("background-color:");
  });

  test("renders General, vertical, wrapping, indentation, direction, and rotation alignment", () => {
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      stylesXml: `<styleSheet xmlns="${namespace}"><fonts count="1"><font><name val="Aptos"/><sz val="11"/></font></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellXfs count="3"><xf/><xf><alignment horizontal="center" vertical="top" wrapText="1" indent="2" readingOrder="2" textRotation="45"/></xf><xf><alignment textRotation="255"/></xf></cellXfs></styleSheet>`,
      sheets: [{
        name: "Sheet1",
        sheetId: 1,
        relationshipId: "sheet1",
        xml: `<worksheet xmlns="${namespace}"><sheetData><row r="1"><c r="A1"><v>42</v></c><c r="B1" t="b"><v>1</v></c><c r="C1" s="1" t="inlineStr"><is><t>wrapped</t></is></c><c r="D1" s="2" t="inlineStr"><is><t>stacked</t></is></c></row></sheetData></worksheet>`,
      }],
    })));
    const worksheet = openWorksheet(workbook, workbook.sheets[0]!);

    expect(spreadsheetCellCss(worksheet, "A1")).toContain("justify-content:flex-end");
    expect(spreadsheetCellCss(worksheet, "B1")).toContain("justify-content:center");
    const wrapped = spreadsheetCellCss(worksheet, "C1");
    expect(wrapped).toContain("text-align:center");
    expect(wrapped).toContain("align-items:flex-start");
    expect(wrapped).toContain("white-space:normal");
    expect(wrapped).toContain("padding-left:calc(8px + 6ch)");
    expect(wrapped).toContain("direction:rtl");
    expect(spreadsheetCellContentCss(worksheet, "C1")).toBe("transform:rotate(-45deg)");
    expect(spreadsheetCellContentCss(worksheet, "D1")).toBe("writing-mode:vertical-rl;text-orientation:upright");
  });
});
