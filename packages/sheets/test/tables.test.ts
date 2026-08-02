import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "@tumbler/opc";
import { openSpreadsheet, openWorksheet, SpreadsheetError } from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

describe("SpreadsheetML tables and AutoFilter", () => {
  test.each(["strict", "transitional"] as const)("reads table semantics from a %s package", (conformance) => {
    const spreadsheet = conformance === "strict"
      ? "http://purl.oclc.org/ooxml/spreadsheetml/main"
      : "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const relationships = conformance === "strict"
      ? "http://purl.oclc.org/ooxml/officeDocument/relationships"
      : "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      conformance,
      sheets: [{
        name: "Data",
        sheetId: 1,
        relationshipId: "sheet",
        xml: `<worksheet xmlns="${spreadsheet}" xmlns:r="${relationships}"><sheetData/><autoFilter ref="F1:G8"><filterColumn colId="0"><filters blank="1"><filter val="Ready"/><filter val="Waiting"/></filters></filterColumn></autoFilter><tableParts count="1"><tablePart r:id="table"/></tableParts></worksheet>`,
        tables: [{
          relationshipId: "table",
          target: "../tables/table1.xml",
          xml: `<table xmlns="${spreadsheet}" id="4" name="Inventory" displayName="Inventory" ref="A1:C5" totalsRowCount="1"><autoFilter ref="A1:C4"><filterColumn colId="1" hiddenButton="1"><customFilters and="1"><customFilter operator="greaterThanOrEqual" val="10"/><customFilter operator="lessThan" val="20"/></customFilters></filterColumn><sortState ref="A2:C4" caseSensitive="1"><sortCondition ref="$B$2:$B$4" descending="1"/></sortState></autoFilter><tableColumns count="3"><tableColumn id="1" name="Item"/><tableColumn id="2" name="Value"/><tableColumn id="3" name="Status" totalsRowLabel="Total" totalsRowFunction="sum"/></tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="1" showRowStripes="1" showColumnStripes="0"/></table>`,
        }],
      }],
    })));

    const worksheet = openWorksheet(workbook, workbook.sheets[0]!);
    expect(worksheet.autoFilter).toEqual({
      range: { start: { row: 1, column: 6 }, end: { row: 8, column: 7 } },
      columns: [{
        columnId: 0,
        hiddenButton: false,
        showButton: true,
        criteria: { kind: "values", values: ["Ready", "Waiting"], includeBlank: true },
      }],
      sortState: undefined,
    });
    expect(worksheet.tables).toHaveLength(1);
    expect(worksheet.tables[0]).toMatchObject({
      id: 4,
      name: "Inventory",
      displayName: "Inventory",
      range: { start: { row: 1, column: 1 }, end: { row: 5, column: 3 } },
      headerRowCount: 1,
      totalsRowCount: 1,
      relationshipId: "table",
      columns: [
        { id: 1, name: "Item" },
        { id: 2, name: "Value" },
        { id: 3, name: "Status", totalsRowLabel: "Total", totalsRowFunction: "sum" },
      ],
      style: { name: "TableStyleMedium2", showFirstColumn: false, showLastColumn: true, showRowStripes: true, showColumnStripes: false },
    });
    expect(worksheet.tables[0]!.autoFilter).toMatchObject({
      columns: [{
        columnId: 1,
        hiddenButton: true,
        showButton: true,
        criteria: {
          kind: "custom",
          join: "and",
          conditions: [
            { operator: "greaterThanOrEqual", value: "10" },
            { operator: "lessThan", value: "20" },
          ],
        },
      }],
      sortState: {
        caseSensitive: true,
        columnSort: false,
        conditions: [{
          range: { start: { row: 2, column: 2 }, end: { row: 4, column: 2 } },
          descending: true,
          sortBy: "value",
        }],
      },
    });
  });

  test("retains unsupported filter kinds as explicit semantic gaps", () => {
    const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const worksheet = fixtureWorksheet(
      `<worksheet xmlns="${namespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/><tableParts><tablePart r:id="table"/></tableParts></worksheet>`,
      `<table xmlns="${namespace}" id="1" name="Data" displayName="Data" ref="A1:A2"><autoFilter ref="A1:A2"><filterColumn colId="0"><dynamicFilter type="today"/></filterColumn></autoFilter><tableColumns count="1"><tableColumn id="1" name="Date"/></tableColumns></table>`,
    );
    expect(worksheet.tables[0]!.autoFilter?.columns[0]?.criteria).toEqual({ kind: "unsupported", element: "dynamicFilter" });
  });

  test.each([
    ["mismatched table column count", `<table xmlns="NS" id="1" name="Data" displayName="Data" ref="A1:B2"><tableColumns count="1"><tableColumn id="1" name="Only"/></tableColumns></table>`],
    ["filter outside the table width", `<table xmlns="NS" id="1" name="Data" displayName="Data" ref="A1:A2"><autoFilter ref="A1:A2"><filterColumn colId="1"><filters/></filterColumn></autoFilter><tableColumns count="1"><tableColumn id="1" name="Only"/></tableColumns></table>`],
    ["repeated column id", `<table xmlns="NS" id="1" name="Data" displayName="Data" ref="A1:B2"><tableColumns count="2"><tableColumn id="1" name="A"/><tableColumn id="1" name="B"/></tableColumns></table>`],
  ])("rejects %s", (_name, template) => {
    const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    expect(() => fixtureWorksheet(
      `<worksheet xmlns="${namespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/><tableParts><tablePart r:id="table"/></tableParts></worksheet>`,
      template.replace("NS", namespace),
    )).toThrow(SpreadsheetError);
  });
});

function fixtureWorksheet(worksheetXml: string, tableXml: string) {
  const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
    sheets: [{
      name: "Data",
      sheetId: 1,
      relationshipId: "sheet",
      xml: worksheetXml,
      tables: [{ relationshipId: "table", target: "../tables/table1.xml", xml: tableXml }],
    }],
  })));
  return openWorksheet(workbook, workbook.sheets[0]!);
}
