import { describe, expect, test } from "bun:test";
import { SparseAxisGeometry } from "@tumblerjs/core";
import { openSpreadsheet, openWorksheet } from "@tumblerjs/sheets";
import { openOpcPackage } from "../../opc/src/index.ts";
import { buildWorkbookFixture } from "../../sheets/test/workbook-fixture.ts";
import { spreadsheetTextOverflowWidth } from "../src/index.ts";

const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

function worksheet(sheetData: string, extra = "") {
  const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
    sheets: [{
      name: "Sheet1",
      sheetId: 1,
      relationshipId: "sheet1",
      xml: `<worksheet xmlns="${namespace}">${extra}<sheetData>${sheetData}</sheetData></worksheet>`,
    }],
  })));
  return openWorksheet(workbook, workbook.sheets[0]!);
}

describe("spreadsheet text overflow", () => {
  test("spills strings through consecutive empty cells without changing axis geometry", () => {
    const sheet = worksheet(`<row r="1"><c r="A1" t="inlineStr"><is><t>hello world</t></is></c><c r="D1" t="inlineStr"><is><t>stop</t></is></c></row>`);
    const columns = new SparseAxisGeometry(8, 100, [{ index: 2, size: 80 }, { index: 3, size: 120 }]);

    expect(spreadsheetTextOverflowWidth({ worksheet: sheet, row: 1, column: 1, columnGeometry: columns, maximumColumn: 8 })).toBe(300);
    expect(columns.size(1)).toBe(100);
    expect(columns.size(2)).toBe(80);
  });

  test("stops before formulas, values, merged ranges, and frozen-pane boundaries", () => {
    const formula = worksheet(`<row r="1"><c r="A1" t="inlineStr"><is><t>hello</t></is></c><c r="C1"><f>1+1</f><v>2</v></c></row>`);
    const merged = worksheet(`<row r="1"><c r="A1" t="inlineStr"><is><t>hello</t></is></c></row>`, `<mergeCells count="1"><mergeCell ref="C1:D1"/></mergeCells>`);
    const columns = new SparseAxisGeometry(8, 100);

    expect(spreadsheetTextOverflowWidth({ worksheet: formula, row: 1, column: 1, columnGeometry: columns, maximumColumn: 8 })).toBe(200);
    expect(spreadsheetTextOverflowWidth({ worksheet: merged, row: 1, column: 1, columnGeometry: columns, maximumColumn: 8 })).toBe(200);
    expect(spreadsheetTextOverflowWidth({ worksheet: formula, row: 1, column: 1, columnGeometry: columns, maximumColumn: 8, frozenColumns: 1 })).toBeUndefined();
  });

  test("does not spill non-text values", () => {
    const sheet = worksheet(`<row r="1"><c r="A1"><v>123456</v></c></row><row r="2"><c r="A2" t="b"><v>1</v></c></row>`);
    const columns = new SparseAxisGeometry(8, 100);

    expect(spreadsheetTextOverflowWidth({ worksheet: sheet, row: 1, column: 1, columnGeometry: columns, maximumColumn: 8 })).toBeUndefined();
    expect(spreadsheetTextOverflowWidth({ worksheet: sheet, row: 2, column: 1, columnGeometry: columns, maximumColumn: 8 })).toBeUndefined();
  });

  test("honours authored wrapping and non-left alignment", () => {
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      stylesXml: `<styleSheet xmlns="${namespace}"><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellXfs count="3"><xf/><xf><alignment wrapText="1"/></xf><xf><alignment horizontal="center"/></xf></cellXfs></styleSheet>`,
      sheets: [{
        name: "Sheet1",
        sheetId: 1,
        relationshipId: "sheet1",
        xml: `<worksheet xmlns="${namespace}"><sheetData><row r="1"><c r="A1" s="1" t="inlineStr"><is><t>wrapped</t></is></c></row><row r="2"><c r="A2" s="2" t="inlineStr"><is><t>centred</t></is></c></row></sheetData></worksheet>`,
      }],
    })));
    const sheet = openWorksheet(workbook, workbook.sheets[0]!);
    const columns = new SparseAxisGeometry(8, 100);

    expect(spreadsheetTextOverflowWidth({ worksheet: sheet, row: 1, column: 1, columnGeometry: columns, maximumColumn: 8 })).toBeUndefined();
    expect(spreadsheetTextOverflowWidth({ worksheet: sheet, row: 2, column: 1, columnGeometry: columns, maximumColumn: 8 })).toBeUndefined();
  });
});
