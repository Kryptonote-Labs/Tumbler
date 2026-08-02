import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { openSpreadsheetArtifact } from "../packages/sheets/src/index.ts";
import { buildWorkbookFixture } from "../packages/sheets/test/workbook-fixture.ts";

const outputDirectory = resolve(process.argv[2] ?? "compatibility-results/input");
await mkdir(outputDirectory, { recursive: true });

const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const original = buildWorkbookFixture({
  sheets: [{
    name: "Values",
    sheetId: 1,
    relationshipId: "sheet1",
    xml: `<worksheet xmlns="${namespace}"><dimension ref="A1:B2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Source</t></is></c><c r="B1"><v>4</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Untouched</t></is></c><c r="B2"><f>B1*2</f><v>8</v></c></row></sheetData></worksheet>`,
  }],
});
const edited = openSpreadsheetArtifact(original).editCell("B1", 5).bytes();
const table = buildWorkbookFixture({
  sheets: [{
    name: "Table",
    sheetId: 1,
    relationshipId: "sheet1",
    xml: `<worksheet xmlns="${namespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:C4"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Item</t></is></c><c r="B1" t="inlineStr"><is><t>Value</t></is></c><c r="C1" t="inlineStr"><is><t>Status</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Alpha</t></is></c><c r="B2"><v>5</v></c><c r="C2" t="inlineStr"><is><t>Ready</t></is></c></row><row r="3" hidden="1"><c r="A3" t="inlineStr"><is><t>Beta</t></is></c><c r="B3"><v>2</v></c><c r="C3" t="inlineStr"><is><t>Waiting</t></is></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>Gamma</t></is></c><c r="B4"><f>4+5</f><v>9</v></c><c r="C4" t="inlineStr"><is><t>Ready</t></is></c></row></sheetData><tableParts count="1"><tablePart r:id="table1"/></tableParts></worksheet>`,
    tables: [{
      relationshipId: "table1",
      target: "../tables/table1.xml",
      xml: `<table xmlns="${namespace}" id="1" name="SampleData" displayName="SampleData" ref="A1:C4"><autoFilter ref="A1:C4"><filterColumn colId="2"><filters><filter val="Ready"/></filters></filterColumn><sortState ref="A2:C4"><sortCondition ref="B2:B4" descending="1"/></sortState></autoFilter><tableColumns count="3"><tableColumn id="1" name="Item"/><tableColumn id="2" name="Value"/><tableColumn id="3" name="Status"/></tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`,
    }],
  }],
});

await Promise.all([
  Bun.write(resolve(outputDirectory, "spreadsheet-original.xlsx"), original),
  Bun.write(resolve(outputDirectory, "spreadsheet-edited.xlsx"), edited),
  Bun.write(resolve(outputDirectory, "spreadsheet-table.xlsx"), table),
]);

console.log(outputDirectory);
