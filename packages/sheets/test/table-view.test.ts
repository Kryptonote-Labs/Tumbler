import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { openOpcPackage } from "@tumbler/opc";
import {
  clearSpreadsheetTableFilter,
  openSpreadsheet,
  openWorksheet,
  projectSpreadsheetTable,
  savedSpreadsheetTableView,
  setSpreadsheetTableSort,
  setSpreadsheetTableValueFilter,
  spreadsheetTableDistinctValues,
} from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

describe("read-only spreadsheet table views", () => {
  test("projects saved filters and stable sorts using cached values", () => {
    const worksheet = dataWorksheet(`<filterColumn colId="2"><filters><filter val="Ready"/></filters></filterColumn><sortState ref="A2:C5"><sortCondition ref="B2:B5" descending="1"/></sortState>`);
    const table = worksheet.tables[0]!;

    const projection = projectSpreadsheetTable(worksheet, table);

    expect(projection.rows).toEqual([4, 5, 2]);
    expect(projection.filteredRows).toEqual([3]);
    expect(worksheet.cell("B4")).toMatchObject({ formula: "4+5", value: { type: "number", value: 9 } });
    expect(projection.warnings).toEqual([]);
  });

  test("supports view-only value filtering, clearing, and sorting", () => {
    const worksheet = dataWorksheet();
    const table = worksheet.tables[0]!;
    const saved = savedSpreadsheetTableView(table).state;
    const filtered = setSpreadsheetTableValueFilter(saved, 2, ["Waiting"]);
    const sorted = setSpreadsheetTableSort(filtered, 0, "descending");

    expect(projectSpreadsheetTable(worksheet, table, sorted).rows).toEqual([3]);
    expect(projectSpreadsheetTable(worksheet, table, clearSpreadsheetTableFilter(sorted, 2)).rows).toEqual([4, 3, 2, 5]);
    expect(saved).toEqual({ filters: [], sorts: [] });
    expect(worksheet.tables[0]!.autoFilter?.columns).toEqual([]);
  });

  test("lists formatted distinct values without evaluating formulas", () => {
    const worksheet = dataWorksheet();
    expect(spreadsheetTableDistinctValues(worksheet, worksheet.tables[0]!, 1)).toEqual(["2", "5", "7", "9"]);
  });

  test("implements escaped Excel wildcards for custom equality filters", () => {
    const worksheet = dataWorksheet(`<filterColumn colId="0"><customFilters><customFilter val="~*literal"/></customFilters></filterColumn>`);
    expect(projectSpreadsheetTable(worksheet, worksheet.tables[0]!).rows).toEqual([5]);
  });

  test("does not apply unsupported saved filter and color sort state", () => {
    const worksheet = dataWorksheet(`<filterColumn colId="0"><dynamicFilter type="today"/></filterColumn><sortState ref="A2:C5"><sortCondition ref="A2:A5" sortBy="cellColor"/></sortState>`);
    const projection = projectSpreadsheetTable(worksheet, worksheet.tables[0]!);
    expect(projection.rows).toEqual([2, 3, 4, 5]);
    expect(projection.warnings).toEqual(["unsupported-filter", "unsupported-sort-method"]);
  });

  test("always returns a stable subset permutation and leaves state untouched", () => {
    const worksheet = dataWorksheet();
    const table = worksheet.tables[0]!;
    fc.assert(fc.property(
      fc.uniqueArray(fc.constantFrom("Ready", "Waiting", "", "Missing"), { maxLength: 4 }),
      fc.constantFrom("ascending", "descending" as const),
      (values, direction) => {
        const state = setSpreadsheetTableSort(setSpreadsheetTableValueFilter({ filters: [], sorts: [] }, 2, values), 1, direction);
        const snapshot = JSON.stringify(state);
        const first = projectSpreadsheetTable(worksheet, table, state).rows;
        const second = projectSpreadsheetTable(worksheet, table, state).rows;
        expect(first).toEqual(second);
        expect(new Set(first).size).toBe(first.length);
        expect(first.every((row) => row >= 2 && row <= 5)).toBe(true);
        expect(JSON.stringify(state)).toBe(snapshot);
      },
    ), { numRuns: 100 });
  });
});

function dataWorksheet(savedState = "") {
  const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
    sheets: [{
      name: "Data",
      sheetId: 1,
      relationshipId: "sheet",
      xml: `<worksheet xmlns="${namespace}" xmlns:r="${relationships}"><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>Item</t></is></c><c r="B1" t="inlineStr"><is><t>Value</t></is></c><c r="C1" t="inlineStr"><is><t>Status</t></is></c></row>
        <row r="2"><c r="A2" t="inlineStr"><is><t>Alpha</t></is></c><c r="B2"><v>5</v></c><c r="C2" t="inlineStr"><is><t>Ready</t></is></c></row>
        <row r="3"><c r="A3" t="inlineStr"><is><t>Beta</t></is></c><c r="B3"><v>2</v></c><c r="C3" t="inlineStr"><is><t>Waiting</t></is></c></row>
        <row r="4"><c r="A4" t="inlineStr"><is><t>Gamma</t></is></c><c r="B4"><f>4+5</f><v>9</v></c><c r="C4" t="inlineStr"><is><t>Ready</t></is></c></row>
        <row r="5"><c r="A5" t="inlineStr"><is><t>*literal</t></is></c><c r="B5"><v>7</v></c><c r="C5" t="inlineStr"><is><t>Ready</t></is></c></row>
      </sheetData><tableParts count="1"><tablePart r:id="table"/></tableParts></worksheet>`,
      tables: [{
        relationshipId: "table",
        target: "../tables/table1.xml",
        xml: `<table xmlns="${namespace}" id="1" name="Data" displayName="Data" ref="A1:C5"><autoFilter ref="A1:C5">${savedState}</autoFilter><tableColumns count="3"><tableColumn id="1" name="Item"/><tableColumn id="2" name="Value"/><tableColumn id="3" name="Status"/></tableColumns></table>`,
      }],
    }],
  })));
  return openWorksheet(workbook, workbook.sheets[0]!);
}
