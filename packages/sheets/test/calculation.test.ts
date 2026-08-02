import { describe, expect, test } from "bun:test";
import { openSpreadsheetArtifact } from "../src/index.ts";
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
      xml: sheet(`<row r="1"><c r="A1"><f>XLOOKUP(1,B1:B2,C1:C2)</f><v>42</v></c></row>`),
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
});

function sheet(rows: string): string {
  return `<worksheet xmlns="${namespace}"><sheetData>${rows}</sheetData></worksheet>`;
}
