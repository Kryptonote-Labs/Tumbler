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

await Promise.all([
  Bun.write(resolve(outputDirectory, "spreadsheet-original.xlsx"), original),
  Bun.write(resolve(outputDirectory, "spreadsheet-edited.xlsx"), edited),
]);

console.log(outputDirectory);
