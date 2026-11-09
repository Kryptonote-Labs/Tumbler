import { describe, expect, test } from "bun:test";
import { calculateSpreadsheetWorksheet, openSpreadsheetArtifact } from "../src/index.ts";
import type { FunctionRegistry } from "@tumblerjs/formulas";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const sheet = (body: string, extra = "") => `<worksheet xmlns="${ns}"><sheetData>${body}</sheetData>${extra}</worksheet>`;

describe("shared formula runtime SpreadsheetML integration", () => {
  test("displays spill overlays without source cells, and refreshes on edit/reopen", () => {
    const bytes = buildWorkbookFixture({sheets: [{name: "Data", sheetId: 1, relationshipId: "data", xml: sheet('<row r="1"><c r="A1"><f>{1,2;3,4}*D1</f></c><c r="D1"><v>2</v></c></row><row r="3"><c r="C3"><f>B2+1</f></c></row>')} ]});
    const artifact = openSpreadsheetArtifact(bytes);
    expect(artifact.calculation.displayText("B2")).toBe("8");
    expect(artifact.calculation.displayText("C3")).toBe("9");
    expect(artifact.calculation.arrayValue("A1")?.rows).toHaveLength(2);
    expect(artifact.worksheet.cell("B2")).toBeUndefined();
    expect(artifact.bytes()).toEqual(bytes);
    const edited = artifact.editCell("D1", 3);
    expect(edited.calculation.displayText("B2")).toBe("12");
    const reopened = openSpreadsheetArtifact(edited.bytes());
    expect(reopened.calculation.displayText("B2")).toBe("12");
    expect(reopened.worksheet.cell("B2")).toBeUndefined();
    const obstruction = artifact.editCell("B2", 7);
    expect(obstruction.calculation.displayText("A1")).toBe("#SPILL!");
    expect(obstruction.calculation.arrayValue("A1")).toBeUndefined();
  });
  test("resolves spill dependencies on another sheet even when that anchor comes later", () => {
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({sheets: [
      {name: "Results", sheetId: 1, relationshipId: "r", xml: sheet('<row r="1"><c r="A1"><f>Inputs!B2+1</f></c></row>')},
      {name: "Inputs", sheetId: 2, relationshipId: "i", xml: sheet('<row r="1"><c r="A1"><f>{1,2;3,4}</f></c></row>')},
    ]}));
    expect(artifact.calculation.displayText("A1")).toBe("5");
  });
  test("merged cells obstruct a spill", () => {
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({sheets: [{name: "Data", sheetId: 1, relationshipId: "data", xml: sheet('<row r="1"><c r="A1"><f>{1,2}</f></c></row>', '<mergeCells count="1"><mergeCell ref="B1:C1"/></mergeCells>')}]}));
    expect(artifact.calculation.displayText("A1")).toBe("#SPILL!");
  });
  test("workbook and scoped names, table columns, used dimensions, and metadata are available to extensions", () => {
    const bytes = buildWorkbookFixture({
      workbookXml: `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="data"/></sheets><definedNames><definedName name="Rate">2</definedName><definedName name="Rate" localSheetId="0">3</definedName><definedName name="Numbers">Data!$B$2:$B$3</definedName></definedNames></workbook>`,
      sheets: [{name: "Data", sheetId: 1, relationshipId: "data", xml: `<worksheet xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>
        <row r="1"><c r="B1" t="inlineStr"><is><t>Amount</t></is></c><c r="D1"><f>SUM(Items[Amount])*Rate+SUM(Numbers)</f></c><c r="E1"><f>META()</f></c></row>
        <row r="2"><c r="B2"><v>4</v></c><c r="D2"><f>SUM(B:B)</f></c></row><row r="3"><c r="B3"><v>5</v></c></row>
        </sheetData><tableParts count="1"><tablePart r:id="table"/></tableParts></worksheet>`,
        tables: [{relationshipId: "table", target: "tables/table1.xml", xml: `<table xmlns="${ns}" id="1" name="Items" displayName="Items" ref="B1:B3" totalsRowShown="0"><tableColumns count="1"><tableColumn id="1" name="Amount"/></tableColumns></table>`}],
      }],
    });
    const artifact = openSpreadsheetArtifact(bytes);
    expect(artifact.calculation.displayText("D1")).toBe("36");
    expect(artifact.calculation.displayText("D2")).toBe("9");
    const registry: FunctionRegistry = new Map([["META", (_, context) => {
      expect(context.source.sheetNames?.()).toEqual(["Data"]);
      expect(context.source.sheetIndex?.(context.address.sheet)).toBe(1);
      expect(context.source.usedDimensions?.(context.address.sheet)).toEqual({rows: 3, columns: 5});
      expect(context.cell({...context.address, row: 2, column: 2})?.numberFormatId).toBe(0);
      return {type: "number", value: 7};
    }]]);
    expect(calculateSpreadsheetWorksheet(artifact.worksheet, {functionRegistries: [registry]}).displayText("E1")).toBe("7");
    expect(artifact.bytes()).toEqual(bytes);
  });
});

// Independent review regressions use actual uncached workbooks, not category mocks.
test("active consumers and transitive dependants refresh after a later spill publishes", () => {
  const bytes = buildWorkbookFixture({sheets: [{name: "Data", sheetId: 1, relationshipId: "data", xml: sheet('<row r="1"><c r="C1"><f>B2+A2</f></c><c r="D1"><f>C1*10</f></c></row><row r="2"><c r="A2"><f>{1,2}</f></c></row>')}]});
  for (const artifact of [openSpreadsheetArtifact(bytes), openSpreadsheetArtifact(openSpreadsheetArtifact(bytes).bytes())]) {
    expect(artifact.calculation.displayText("B2")).toBe("2");
    expect(artifact.calculation.displayText("C1")).toBe("3");
    expect(artifact.calculation.displayText("D1")).toBe("30");
    expect(artifact.calculation.diagnostics).toEqual([]);
  }
});

test("single-cell references retain aggregate coercion and nested aggregate result ranges resolve", () => {
  const artifact = openSpreadsheetArtifact(buildWorkbookFixture({sheets: [{name: "Data", sheetId: 1, relationshipId: "data", xml: sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>7</t></is></c><c r="B1" t="b"><v>1</v></c><c r="C1"><v>1</v></c><c r="D1"><v>10</v></c><c r="F1"><f>SUM(A1:A1)</f></c><c r="G1"><f>COUNT(B1:B1)</f></c><c r="H1"><f>AVERAGE(A1:A1)</f></c><c r="I1"><f>SUMIF(C1:C2,&quot;&gt;0&quot;,OFFSET(D1,0,0,2))</f></c><c r="J1"><f>AVERAGEIF(C1:C2,&quot;&gt;0&quot;,INDEX(D1:D2,0))</f></c></row><row r="2"><c r="C2"><v>2</v></c><c r="D2"><v>20</v></c></row>')}]}));
  expect(artifact.calculation.displayText("F1")).toBe("0");
  expect(artifact.calculation.displayText("G1")).toBe("0");
  expect(artifact.calculation.displayText("H1")).toBe("#DIV/0!");
  expect(artifact.calculation.displayText("I1")).toBe("30");
  expect(artifact.calculation.displayText("J1")).toBe("15");
  expect(artifact.calculation.diagnostics).toEqual([]);
});

test("scalar arithmetic and functions remain scalar at merged anchors", () => {
  for (const formula of ["A1+1", "ABS(A1)"]) {
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({sheets: [{name: "Data", sheetId: 1, relationshipId: "data", xml: sheet(`<row r="1"><c r="A1"><v>2</v></c><c r="C1"><f>${formula}</f></c></row>`, '<mergeCells count="1"><mergeCell ref="C1:D1"/></mergeCells>')}]}));
    expect(artifact.calculation.displayText("C1")).toBe(formula === "A1+1" ? "3" : "2");
    expect(artifact.calculation.arrayValue("C1")).toBeUndefined();
  }
});

test("nested reference results keep aggregate coercion provenance", () => {
  const artifact = openSpreadsheetArtifact(buildWorkbookFixture({sheets: [{name: "Data", sheetId: 1, relationshipId: "data", xml: sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>7</t></is></c><c r="B1" t="b"><v>1</v></c><c r="D1"><f>SUM(INDEX(A1:A2,1))</f></c><c r="E1"><f>AVERAGE(INDEX(A1:A2,1))</f></c><c r="F1"><f>COUNT(INDIRECT(&quot;B1&quot;))</f></c></row>')}]}));
  expect(artifact.calculation.displayText("D1")).toBe("0");
  expect(artifact.calculation.displayText("E1")).toBe("#DIV/0!");
  expect(artifact.calculation.displayText("F1")).toBe("0");
});

test("whole-axis aggregates include virtual spill cells beyond source dimensions", () => {
  for (const anchor of ["A2", "B2"]) {
    // A2 spills across B and down; B2 spills down. No source cells exist below row 2.
    const formula = anchor === "A2" ? "{0,1;0,2;0,3}" : "{1;2;3}";
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({sheets: [{name: "Data", sheetId: 1, relationshipId: "data", xml: sheet(`<row r="1"><c r="D1"><f>SUM(B:B)</f></c><c r="E1"><f>COUNT(B:B)</f></c><c r="F1"><f>AVERAGE(B:B)</f></c></row><row r="2"><c r="${anchor}"><f>${formula}</f></c></row>`)}]}));
    for (const current of [artifact, openSpreadsheetArtifact(artifact.bytes())]) {
      expect(current.calculation.displayText("D1")).toBe("6");
      expect(current.calculation.displayText("E1")).toBe("3");
      expect(current.calculation.displayText("F1")).toBe("2");
      expect(current.calculation.diagnostics).toEqual([]);
    }
  }
});
