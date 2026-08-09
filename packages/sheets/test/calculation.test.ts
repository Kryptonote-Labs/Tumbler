import { describe, expect, test } from "bun:test";
import {
  calculateSpreadsheetWorksheet,
  openSpreadsheetArtifact,
  projectSpreadsheetTable,
  setSpreadsheetTableValueFilter,
  savedSpreadsheetAutoFilterView,
  spreadsheetTableDistinctValues,
} from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

describe("SpreadsheetML calculated-value overlays", () => {
  test("calculates the generated Sample Data sheet without cached results", () => {
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({ sheets: [
      { name: "Welcome", sheetId: 1, relationshipId: "welcome", xml: sheet(`<row r="1"><c r="A1" t="inlineStr"><is><t>Welcome</t></is></c></row>`) },
      { name: "Sample Data", sheetId: 2, relationshipId: "sample", xml: sheet(`
        <row r="5"><c r="B5"><v>13</v></c><c r="D5" t="str"><f>IF(B5&gt;0,&quot;OK&quot;,&quot;Check&quot;)</f><v/></c></row>
        <row r="6"><c r="B6"><v>4</v></c><c r="D6" t="str"><f>IF(B6&gt;0,&quot;OK&quot;,&quot;Check&quot;)</f><v/></c></row>
        <row r="7"><c r="B7"><v>1</v></c><c r="D7" t="str"><f>IF(B7&gt;0,&quot;OK&quot;,&quot;Check&quot;)</f><v/></c></row>
        <row r="10"><c r="C10"><f>SUM(B5:B7)</f><v/></c></row>
      `) },
    ] })).selectSheet("Sample Data");

    expect(artifact.calculation.value("D5")).toEqual({ type: "string", value: "OK", storage: "formula" });
    expect(artifact.calculation.value("D6")).toEqual({ type: "string", value: "OK", storage: "formula" });
    expect(artifact.calculation.value("D7")).toEqual({ type: "string", value: "OK", storage: "formula" });
    expect(artifact.calculation.value("C10")).toEqual({ type: "number", value: 18, lexical: "18" });
    expect(artifact.calculation.displayText("C10")).toBe("18");
    expect(artifact.calculation.diagnostics).toEqual([]);
    expect(artifact.bytes()).toEqual(artifact.workbook.package.archive.originalBytes());
  });

  test("resolves cross-sheet dependencies case-insensitively", () => {
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({ sheets: [
      { name: "Inputs", sheetId: 1, relationshipId: "inputs", xml: sheet(`<row r="1"><c r="A1"><v>4</v></c></row>`) },
      { name: "Results", sheetId: 2, relationshipId: "results", xml: sheet(`<row r="1"><c r="A1"><f>inputs!A1*2</f><v/></c></row><row r="2"><c r="A2"><f>A1+2</f><v/></c></row>`) },
    ] }), { sheet: "Results" });
    expect(artifact.calculation.displayText("A2")).toBe("10");
  });

  test("retains a producer cache when a formula is not supported", () => {
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({ sheets: [{
      name: "Data",
      sheetId: 1,
      relationshipId: "data",
      xml: sheet(`<row r="1"><c r="A1"><f>OFFSET(B1,0,0)</f><v>42</v></c></row>`),
    }] }));
    expect(artifact.calculation.value("A1")).toBeUndefined();
    expect(artifact.calculation.displayText("A1")).toBe("42");
    expect(artifact.calculation.diagnostics[0]?.code).toBe("unsupported-function");
  });

  test("recalculates dependants after a scalar edit", () => {
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({ sheets: [{
      name: "Data",
      sheetId: 1,
      relationshipId: "data",
      xml: sheet(`<row r="1"><c r="A1"><v>2</v></c><c r="B1"><f>A1*3</f><v/></c></row>`),
    }] }));
    expect(artifact.calculation.displayText("B1")).toBe("6");
    const edited = artifact.editCell("A1", 5);
    expect(edited.calculation.displayText("B1")).toBe("15");
  });

  test("passes the workbook's 1904 date system into formula calculation", () => {
    const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({
      workbookXml: `<workbook xmlns="${namespace}" xmlns:r="${relationships}"><workbookPr date1904="true"/><sheets><sheet name="Data" sheetId="1" r:id="data"/></sheets></workbook>`,
      sheets: [{
        name: "Data",
        sheetId: 1,
        relationshipId: "data",
        xml: sheet(`<row r="1"><c r="A1"><f>DATE(1904,1,1)</f><v/></c></row>`),
      }],
    }));

    expect(artifact.workbook.dateSystem).toBe("1904");
    expect(artifact.calculation.value("A1")).toEqual({ type: "number", value: 0, lexical: "0" });
  });

  test("calculates SUBTOTAL and AGGREGATE from saved and view-only filters", () => {
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({ sheets: [{
      name: "Data",
      sheetId: 1,
      relationshipId: "data",
      xml: `<worksheet xmlns="${namespace}"><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>Status</t></is></c><c r="B1" t="inlineStr"><is><t>Value</t></is></c></row>
        <row r="2"><c r="A2" t="inlineStr"><is><t>Keep</t></is></c><c r="B2"><v>10</v></c></row>
        <row r="3" hidden="1"><c r="A3" t="inlineStr"><is><t>Keep</t></is></c><c r="B3"><v>20</v></c></row>
        <row r="4"><c r="A4" t="inlineStr"><is><t>Drop</t></is></c><c r="B4"><v>30</v></c></row>
        <row r="5"><c r="C5"><f>SUBTOTAL(9,B2:B4)</f><v/></c><c r="D5"><f>SUBTOTAL(109,B2:B4)</f><v/></c></row>
        <row r="6"><c r="C6"><f>_xlfn.AGGREGATE(9,0,B2:B4)</f><v/></c><c r="D6"><f>_xlfn.AGGREGATE(9,1,B2:B4)</f><v/></c></row>
      </sheetData><autoFilter ref="A1:B4"><filterColumn colId="0"><filters><filter val="Keep"/></filters></filterColumn></autoFilter></worksheet>`,
    }] }));

    expect(artifact.calculation.displayText("C5")).toBe("30");
    expect(artifact.calculation.displayText("D5")).toBe("10");
    expect(artifact.calculation.displayText("C6")).toBe("30");
    expect(artifact.calculation.displayText("D6")).toBe("10");

    const filter = artifact.worksheet.autoFilter!;
    const state = setSpreadsheetTableValueFilter(savedSpreadsheetAutoFilterView(filter).state, 0, ["Drop"]);
    const changed = calculateSpreadsheetWorksheet(artifact.worksheet, { worksheetFilterStates: { "1": state } });
    expect(changed.displayText("C5")).toBe("30");
    expect(changed.displayText("D5")).toBe("30");
  });

  test("retains aggregate caches when saved filter visibility is unsupported", () => {
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({ sheets: [{
      name: "Data",
      sheetId: 1,
      relationshipId: "data",
      xml: `<worksheet xmlns="${namespace}"><sheetData>
        <row r="1"><c r="A1"><v>1</v></c></row>
        <row r="2"><c r="A2"><v>10</v></c><c r="B2"><f>SUBTOTAL(9,A2)</f><v>99</v></c></row>
      </sheetData><autoFilter ref="A1:A2"><filterColumn colId="0"><dynamicFilter type="today"/></filterColumn></autoFilter></worksheet>`,
    }] }));

    expect(artifact.calculation.value("B2")).toBeUndefined();
    expect(artifact.calculation.displayText("B2")).toBe("99");
    expect(artifact.calculation.diagnostics[0]?.code).toBe("unavailable-dependency");
  });

  test("recalculates cross-sheet conditional aggregates after source edits", () => {
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({ sheets: [
      {
        name: "Input Data",
        sheetId: 1,
        relationshipId: "inputs",
        xml: sheet(`
          <row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>10</v></c></row>
          <row r="2"><c r="A2"><v>-1</v></c><c r="B2"><v>20</v></c></row>
          <row r="3"><c r="A3"><v>2</v></c><c r="B3"><v>30</v></c></row>
        `),
      },
      {
        name: "Results",
        sheetId: 2,
        relationshipId: "results",
        xml: sheet(`
          <row r="1"><c r="A1"><f>COUNTIF('Input Data'!A1:A3,&quot;&gt;0&quot;)</f><v/></c></row>
          <row r="2"><c r="A2"><f>SUMIF('Input Data'!A1:A3,&quot;&gt;0&quot;,'Input Data'!B1)</f><v/></c></row>
          <row r="3"><c r="A3"><f>AVERAGEIF('Input Data'!A1:A3,&quot;&gt;0&quot;,'Input Data'!B1:B1)</f><v/></c></row>
        `),
      },
    ] }), { sheet: "Results" });

    expect(artifact.calculation.displayText("A1")).toBe("2");
    expect(artifact.calculation.displayText("A2")).toBe("40");
    expect(artifact.calculation.displayText("A3")).toBe("20");

    const edited = artifact.editCellOnSheet("Input Data", "A2", 3);
    expect(edited.activeSheet.name).toBe("Results");
    expect(edited.calculation.displayText("A1")).toBe("3");
    expect(edited.calculation.displayText("A2")).toBe("60");
    expect(edited.calculation.displayText("A3")).toBe("20");
    expect(edited.calculation.diagnostics).toEqual([]);
  });

  test("writes, reopens, and immutably calculates conditional aggregate formulas", () => {
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({ sheets: [{
      name: "Data",
      sheetId: 1,
      relationshipId: "data",
      xml: sheet(`
        <row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>10</v></c></row>
        <row r="2"><c r="A2"><v>-1</v></c><c r="B2"><v>20</v></c></row>
        <row r="3"><c r="A3"><v>2</v></c><c r="B3"><v>30</v></c></row>
      `),
    }] }));

    const edited = artifact.editFormula("C1", `SUMIF(A1:A3,">0",B1)`);
    expect(artifact.worksheet.cell("C1")).toBeUndefined();
    expect(edited.worksheet.cell("C1")?.formula).toBe(`SUMIF(A1:A3,">0",B1)`);
    expect(edited.calculation.displayText("C1")).toBe("40");

    const reopened = openSpreadsheetArtifact(edited.bytes());
    expect(reopened.worksheet.cell("C1")?.formula).toBe(`SUMIF(A1:A3,">0",B1)`);
    expect(reopened.calculation.displayText("C1")).toBe("40");
    expect(reopened.calculation.diagnostics).toEqual([]);
  });

  test("keeps cached rendering available when workbook calculation limits are exceeded", () => {
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({ sheets: [{
      name: "Data",
      sheetId: 1,
      relationshipId: "data",
      xml: sheet(`<row r="1"><c r="A1"><f>1+1</f><v>2</v></c></row>`),
    }] }));
    const limited = calculateSpreadsheetWorksheet(artifact.worksheet, { maxFormulaCells: 0 });
    expect(limited.value("A1")).toBeUndefined();
    expect(limited.displayText("A1")).toBe("2");
    expect(limited.diagnostics[0]?.code).toBe("evaluation-limit");
  });

  test("supplies calculated values to table filters and sorting", () => {
    const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({ sheets: [{
      name: "Data",
      sheetId: 1,
      relationshipId: "data",
      xml: `<worksheet xmlns="${namespace}" xmlns:r="${relationships}"><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>Value</t></is></c><c r="B1" t="inlineStr"><is><t>Check</t></is></c></row>
        <row r="2"><c r="A2"><v>2</v></c><c r="B2" t="str"><f>IF(A2&gt;0,&quot;OK&quot;,&quot;Check&quot;)</f><v/></c></row>
        <row r="3"><c r="A3"><v>-1</v></c><c r="B3" t="str"><f>IF(A3&gt;0,&quot;OK&quot;,&quot;Check&quot;)</f><v/></c></row>
      </sheetData><tableParts count="1"><tablePart r:id="table"/></tableParts></worksheet>`,
      tables: [{ relationshipId: "table", target: "../tables/table1.xml", xml: `<table xmlns="${namespace}" id="1" name="Data" displayName="Data" ref="A1:B3"><autoFilter ref="A1:B3"/><tableColumns count="2"><tableColumn id="1" name="Value"/><tableColumn id="2" name="Check"/></tableColumns></table>` }],
    }] }));
    const table = artifact.worksheet.tables[0]!;
    const provider = {
      value: (row: number, column: number) => artifact.calculation.value({ row, column }),
      displayText: (row: number, column: number) => artifact.calculation.displayText({ row, column }),
    };
    expect(spreadsheetTableDistinctValues(artifact.worksheet, table, 1, provider)).toEqual(["Check", "OK"]);
    const state = setSpreadsheetTableValueFilter({ filters: [], sorts: [] }, 1, ["OK"]);
    expect(projectSpreadsheetTable(artifact.worksheet, table, state, provider).rows).toEqual([2]);
  });
});

function sheet(rows: string): string {
  return `<worksheet xmlns="${namespace}"><sheetData>${rows}</sheetData></worksheet>`;
}
