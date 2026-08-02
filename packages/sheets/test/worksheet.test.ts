import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "@tumbler/opc";
import {
  openSpreadsheet,
  openWorksheet,
  columnWidthToPixels,
  SpreadsheetError,
  type SpreadsheetErrorCode,
} from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

describe("SpreadsheetML sparse worksheets", () => {
  test.each(["strict", "transitional"] as const)("reads values and layout from a %s worksheet", (conformance) => {
    const namespace = conformance === "strict"
      ? "http://purl.oclc.org/ooxml/spreadsheetml/main"
      : "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      conformance,
      sharedStringsXml: `<sst xmlns="${namespace}" count="2" uniqueCount="2"><si><t>unused</t></si><si><r><t>Shared</t></r><r><t> text</t></r></si></sst>`,
      sheets: [{
        name: "Data",
        sheetId: 9,
        relationshipId: "data",
        xml: `<worksheet xmlns="${namespace}">
          <dimension ref="A2:H3"/>
          <sheetViews><sheetView workbookViewId="0"><pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>
          <cols><col min="2" max="4" width="12.5" customWidth="1"/><col min="6" max="6" hidden="true"/></cols>
          <sheetData>
            <row r="2" ht="18.25" hidden="0">
              <c r="A2"><f>1+2</f><v>3</v></c>
              <c r="B2" t="s"><v>1</v></c>
              <c r="C2" t="inlineStr"><is><r><rPr><b/></rPr><t>Inline</t></r><r><t> text</t></r></is></c>
              <c r="D2" t="b"><v>true</v></c>
              <c r="E2" t="e"><v>#DIV/0!</v></c>
              <c r="F2" t="d"><v>2026-08-02T12:00:00Z</v></c>
              <c r="G2" t="str"><f>CONCAT(&quot;a&quot;,&quot;b&quot;)</f><v>ab</v></c>
              <c r="H2" s="4"/>
            </row>
            <row hidden="1"><c><v>10</v></c><c t="inlineStr"><is><t>inferred</t></is></c></row>
          </sheetData>
          <mergeCells count="2"><mergeCell ref="A5:B5"/><mergeCell ref="C6:D7"/></mergeCells>
        </worksheet>`,
      }],
    })));
    const worksheet = openWorksheet(workbook, workbook.sheets[0]!);

    expect(worksheet.dimension).toEqual({ start: { row: 2, column: 1 }, end: { row: 3, column: 8 } });
    expect(worksheet.columns).toEqual([
      { min: 2, max: 4, width: 12.5, hidden: false, customWidth: true },
      { min: 6, max: 6, width: undefined, hidden: true, customWidth: false },
    ]);
    expect(worksheet.panes).toEqual([{
      workbookViewId: 0,
      xSplit: 2,
      ySplit: 1,
      topLeftCell: { row: 2, column: 3 },
      activePane: "bottomRight",
      state: "frozen",
    }]);
    expect(worksheet.merges).toEqual([
      { start: { row: 5, column: 1 }, end: { row: 5, column: 2 } },
      { start: { row: 6, column: 3 }, end: { row: 7, column: 4 } },
    ]);
    expect(worksheet.mergedRange("D7")).toEqual({ start: { row: 6, column: 3 }, end: { row: 7, column: 4 } });
    expect(worksheet.mergedRange("A1")).toBeUndefined();
    expect(worksheet.rows.map(({ index, height, hidden }) => ({ index, height, hidden }))).toEqual([
      { index: 2, height: 18.25, hidden: false },
      { index: 3, height: undefined, hidden: true },
    ]);
    expect(worksheet.cell("a2")).toMatchObject({ formula: "1+2", value: { type: "number", value: 3, lexical: "3" } });
    expect(worksheet.cell("B2")?.value).toEqual({ type: "string", value: "Shared text", storage: "shared" });
    expect(worksheet.cell("C2")?.value).toEqual({ type: "string", value: "Inline text", storage: "inline" });
    expect(worksheet.cell("D2")?.value).toEqual({ type: "boolean", value: true });
    expect(worksheet.cell("E2")?.value).toEqual({ type: "error", value: "#DIV/0!" });
    expect(worksheet.cell("F2")?.value).toEqual({ type: "date", value: "2026-08-02T12:00:00Z" });
    expect(worksheet.cell("G2")).toMatchObject({ formula: `CONCAT("a","b")`, value: { type: "string", value: "ab", storage: "formula" } });
    expect(worksheet.cell("H2")).toMatchObject({ styleIndex: 4, value: { type: "blank" } });
    expect(worksheet.cell("A3")?.value).toMatchObject({ type: "number", value: 10 });
    expect(worksheet.cell("B3")?.value).toMatchObject({ type: "string", value: "inferred" });
    expect(worksheet.cell("Z99")).toBeUndefined();
  });

  test("rejects a sheet from another workbook", () => {
    const first = openSpreadsheet(openOpcPackage(buildWorkbookFixture()));
    const second = openSpreadsheet(openOpcPackage(buildWorkbookFixture()));
    expect(() => openWorksheet(first, second.sheets[0]!)).toThrow(TypeError);
  });

  test("resolves cell styles into formatted display text", () => {
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      stylesXml: `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font/></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" numFmtId="0"/><xf fontId="0" fillId="0" borderId="0" numFmtId="10"/></cellXfs></styleSheet>`,
      sheets: [{ name: "Sheet1", sheetId: 1, relationshipId: "sheet1", xml: `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" s="1"><v>0.125</v></c></row></sheetData></worksheet>` }],
    })));
    const worksheet = openWorksheet(workbook, workbook.sheets[0]!);
    expect(worksheet.displayText("A1")).toBe("12.50%");
    expect(worksheet.cellStyle("A1").numberFormatId).toBe(10);
    expect(worksheet.displayText("B2")).toBe("");
  });

  test("builds sparse pixel geometry from standard row and column measurements", () => {
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      sheets: [{ name: "Sheet1", sheetId: 1, relationshipId: "sheet1", xml: `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetFormatPr defaultRowHeight="18" defaultColWidth="10"/><cols><col min="2" max="3" width="20"/><col min="5" max="5" hidden="1"/></cols><sheetData><row r="2" ht="30"/><row r="4" hidden="1"/></sheetData></worksheet>` }],
    })));
    const worksheet = openWorksheet(workbook, workbook.sheets[0]!);
    const rows = worksheet.rowGeometry(10);
    const columns = worksheet.columnGeometry(10);
    expect(rows.defaultSize).toBe(24);
    expect(rows.size(2)).toBe(40);
    expect(rows.size(4)).toBe(0);
    expect(columns.defaultSize).toBe(columnWidthToPixels(10));
    expect(columns.size(2)).toBe(columnWidthToPixels(20));
    expect(columns.size(3)).toBe(columnWidthToPixels(20));
    expect(columns.size(5)).toBe(0);
    expect(columnWidthToPixels(8.7109375)).toBe(61);
  });

  test.each([
    ["invalid_worksheet", `<worksheet xmlns="NS"/>`],
    ["invalid_worksheet", `<worksheet xmlns="NS"><sheetData><row r="1"/><row r="1"/></sheetData></worksheet>`],
    ["invalid_cell", `<worksheet xmlns="NS"><sheetData><row r="2"><c r="A3"><v>1</v></c></row></sheetData></worksheet>`],
    ["invalid_cell", `<worksheet xmlns="NS"><sheetData><row r="1"><c r="A1" t="mystery"><v>1</v></c></row></sheetData></worksheet>`],
    ["invalid_cell", `<worksheet xmlns="NS"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is><v>1</v></c></row></sheetData></worksheet>`],
    ["missing_shared_string", `<worksheet xmlns="NS"><sheetData><row r="1"><c r="A1" t="s"><v>8</v></c></row></sheetData></worksheet>`],
    ["invalid_worksheet", `<worksheet xmlns="NS"><sheetData/><mergeCells><mergeCell ref="A1:C3"/><mergeCell ref="B2:D4"/></mergeCells></worksheet>`],
    ["invalid_worksheet", `<worksheet xmlns="NS"><cols><col min="4" max="2"/></cols><sheetData/></worksheet>`],
  ] as const)("rejects hostile worksheet markup with %s", (code, template) => {
    const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      sharedStringsXml: `<sst xmlns="${namespace}" count="1" uniqueCount="1"><si><t>only</t></si></sst>`,
      sheets: [{ name: "Sheet1", sheetId: 1, relationshipId: "sheet1", xml: template.replace("NS", namespace) }],
    })));
    expectSpreadsheetError(() => openWorksheet(workbook, workbook.sheets[0]!), code);
  });
});

function expectSpreadsheetError(action: () => unknown, code: SpreadsheetErrorCode): void {
  try {
    action();
    throw new Error("Expected SpreadsheetError.");
  } catch (error) {
    expect(error).toBeInstanceOf(SpreadsheetError);
    expect((error as SpreadsheetError).code).toBe(code);
  }
}
