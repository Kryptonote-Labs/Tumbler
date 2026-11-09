import { expect, test } from "bun:test";
import { openSpreadsheetArtifact } from "../../sheets/src/index.ts";
import { buildWorkbookFixture } from "../../sheets/test/workbook-fixture.ts";

const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
for (const [content, sum, average, count] of [
  ['t="inlineStr"><is><t>7</t></is>', "0", "#DIV/0!", "0"],
  ['t="b"><v>1</v>', "0", "#DIV/0!", "0"],
  ['><v>7</v>', "7", "7", "1"],
  ['>', "0", "#DIV/0!", "0"],
]) test(`INDIRECT structured reference retains geometry and values: ${content}`, () => {
  const bytes = buildWorkbookFixture({sheets: [{name:"Data",sheetId:1,relationshipId:"data",
    xml:`<worksheet xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Amount</t></is></c><c r="C1"><f>SUM(INDIRECT("Items[Amount]"))</f></c><c r="D1"><f>AVERAGE(INDIRECT("Items[Amount]"))</f></c><c r="E1"><f>COUNT(INDIRECT("Items[Amount]"))</f></c><c r="F1"><f>ROW(INDIRECT("Items[Amount]"))</f></c><c r="G1"><f>SUM(INDIRECT("Items[[#Data],[Amount]]"))</f></c><c r="H1"><f>SUM(INDIRECT("items[amount]"))</f></c><c r="I1"><f>INDIRECT("Items[Missing]")</f></c></row><row r="2"><c r="A2" ${content}</c></row></sheetData><tableParts count="1"><tablePart r:id="table"/></tableParts></worksheet>`,
    tables:[{relationshipId:"table",target:"tables/table1.xml",xml:`<table xmlns="${ns}" id="1" name="Items" displayName="Items" ref="A1:A2" totalsRowShown="0"><tableColumns count="1"><tableColumn id="1" name="Amount"/></tableColumns></table>`}],
  }]});
  const artifact = openSpreadsheetArtifact(bytes);
  for (const current of [artifact, openSpreadsheetArtifact(artifact.bytes())]) {
    for (const cell of ["C1","G1","H1"]) expect(current.calculation.displayText(cell)).toBe(sum!);
    expect(current.calculation.displayText("D1")).toBe(average!);
    expect(current.calculation.displayText("E1")).toBe(count!);
    expect(current.calculation.displayText("F1")).toBe("2");
    expect(current.calculation.displayText("I1")).toBe("#REF!");
    expect(current.calculation.diagnostics).toEqual([]);
  }
  const edited = artifact.editCell("A2", 8);
  for (const current of [edited,openSpreadsheetArtifact(edited.bytes())]) {
    for (const cell of ["C1","D1","G1","H1"]) expect(current.calculation.displayText(cell)).toBe("8");
    expect(current.calculation.displayText("E1")).toBe("1");
    expect(current.calculation.displayText("F1")).toBe("2");
    expect(current.calculation.diagnostics).toEqual([]);
  }
  expect(artifact.bytes()).toEqual(bytes);
});
