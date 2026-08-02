import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "@tumbler/opc";
import {
  beginSpreadsheetEdit,
  openSpreadsheet,
  openWorksheet,
  SpreadsheetError,
} from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

describe("SpreadsheetML cell editing", () => {
  test("edits existing and new cells, saves, and reopens", () => {
    const source = buildEditableWorkbook();
    const before = openOpcPackage(source);
    const workbook = openSpreadsheet(before);
    const data = workbook.sheet("Data")!;
    const editor = beginSpreadsheetEdit(workbook)
      .setCellValue(data, "A1", `new <text> & data`)
      .setCellValue(data, "B2", 42.5)
      .setCellValue(data, "C1", null)
      .setCellValue(data, "D4", true);
    const saved = editor.commit();
    const reopenedPackage = openOpcPackage(saved);
    const reopened = openSpreadsheet(reopenedPackage);
    const worksheet = openWorksheet(reopened, reopened.sheet("Data")!);

    expect(editor.status).toBe("committed");
    expect(worksheet.cell("A1")).toMatchObject({
      styleIndex: 7,
      value: { type: "string", value: `new <text> & data`, storage: "inline" },
    });
    expect(worksheet.cell("B2")?.value).toEqual({ type: "number", value: 42.5, lexical: "42.5" });
    expect(worksheet.cell("C1")).toMatchObject({ formula: undefined, value: { type: "blank" } });
    expect(worksheet.cell("D4")?.value).toEqual({ type: "boolean", value: true });
    expect(worksheet.dimension).toEqual({ start: { row: 1, column: 1 }, end: { row: 4, column: 4 } });
    expect(worksheet.document.source).toContain(`<extLst><ext uri="preserve-me"/></extLst>`);
    expect(worksheet.document.source).toContain(`new &lt;text> &amp; data`);

    for (const itemName of ["xl/workbook.xml", "xl/strings/shared.xml", "xl/worksheets/sheet2.xml"]) {
      expect(reopenedPackage.archive.compressedBytes(reopenedPackage.archive.get(itemName)!)).toEqual(
        before.archive.compressedBytes(before.archive.get(itemName)!),
      );
    }
  });

  test("inserts into self-closing rows and sheetData in grid order", () => {
    const source = buildWorkbookFixture({
      sheets: [{
        name: "Data",
        sheetId: 1,
        relationshipId: "data",
        xml: `<worksheet xmlns="${namespace}"><sheetData><row r="2"/><row r="8"><c r="C8"><v>3</v></c></row></sheetData></worksheet>`,
      }],
    });
    const workbook = openSpreadsheet(openOpcPackage(source));
    const sheet = workbook.sheets[0]!;
    const saved = beginSpreadsheetEdit(workbook)
      .setCellValue(sheet, "B2", "row")
      .setCellValue(sheet, "A5", 5)
      .setCellValue(sheet, "A8", false)
      .commit();
    const reopened = openSpreadsheet(openOpcPackage(saved));
    const worksheet = openWorksheet(reopened, reopened.sheets[0]!);
    expect(worksheet.rows.map((row) => row.index)).toEqual([2, 5, 8]);
    expect(worksheet.rows[2]?.cells.map((cell) => cell.reference)).toEqual(["A8", "C8"]);
    expect(worksheet.cell("B2")?.value).toMatchObject({ value: "row" });
    expect(worksheet.cell("A5")?.value).toMatchObject({ value: 5 });
  });

  test("returns the original package for no edits and semantic no-ops", () => {
    const source = buildEditableWorkbook();
    const workbook = openSpreadsheet(openOpcPackage(source));
    expect(beginSpreadsheetEdit(workbook).commit()).toBe(source);
    expect(beginSpreadsheetEdit(workbook).setCellValue(workbook.sheet("Data")!, "B1", 2).commit()).toBe(source);
  });

  test("validates values, ownership, rollback, and terminal state", () => {
    const first = openSpreadsheet(openOpcPackage(buildEditableWorkbook()));
    const second = openSpreadsheet(openOpcPackage(buildEditableWorkbook()));
    const editor = beginSpreadsheetEdit(first);
    expect(() => editor.setCellValue(first.sheets[0]!, "A1", Number.NaN)).toThrow(TypeError);
    expect(() => editor.setCellValue(second.sheets[0]!, "A1", 1)).toThrow(TypeError);
    editor.setCellValue(first.sheets[0]!, "A1", "discarded").rollback();
    expect(editor.status).toBe("rolled_back");
    expect(() => editor.commit()).toThrow(SpreadsheetError);
  });
});

function buildEditableWorkbook(): Uint8Array {
  return buildWorkbookFixture({
    sharedStringsXml: `<sst xmlns="${namespace}" count="1" uniqueCount="1"><si><t>old shared</t></si></sst>`,
    sheets: [
      {
        name: "Data",
        sheetId: 1,
        relationshipId: "data",
        xml: `<worksheet xmlns="${namespace}"><dimension ref="A1:C2"/><sheetData>
          <row r="1"><c r="A1" s="7" t="s" custom="keep"><v>0</v><extLst><ext uri="preserve-me"/></extLst></c><c r="B1"><v>2</v></c><c r="C1"><f>1+1</f><v>2</v></c></row>
        </sheetData></worksheet>`,
      },
      { name: "Untouched", sheetId: 2, relationshipId: "untouched", xml: `<worksheet xmlns="${namespace}"><sheetData><row r="1"><c r="A1"><v>99</v></c></row></sheetData></worksheet>` },
    ],
  });
}
