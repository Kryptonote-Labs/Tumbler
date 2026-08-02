import { resolve } from "node:path";
import { openSpreadsheetArtifact } from "../packages/sheets/src/index.ts";
import { projectSpreadsheetTable } from "../packages/sheets/src/index.ts";

const directory = resolve(process.argv[2] ?? "compatibility-results/libreoffice");
const expectations = [
  { name: "spreadsheet-original.xlsx", input: 4, calculated: 8 },
  { name: "spreadsheet-edited.xlsx", input: 5, calculated: 10 },
] as const;

for (const expectation of expectations) {
  const file = Bun.file(resolve(directory, expectation.name));
  if (!await file.exists()) throw new Error(`LibreOffice did not produce ${expectation.name}.`);
  const artifact = openSpreadsheetArtifact(new Uint8Array(await file.arrayBuffer()));
  const worksheet = artifact.worksheet;
  if (worksheet.displayText("A1") !== "Source" || worksheet.displayText("A2") !== "Untouched") {
    throw new Error(`${expectation.name} did not preserve text cells.`);
  }
  if (worksheet.cell("B1")?.value.value !== expectation.input) {
    throw new Error(`${expectation.name} did not preserve the edited input.`);
  }
  const formula = worksheet.cell("B2");
  if (formula?.formula !== "B1*2" || formula.value.value !== expectation.calculated) {
    throw new Error(`${expectation.name} did not preserve and recalculate its formula: ${JSON.stringify({
      formula: formula?.formula,
      value: formula?.value,
      expectedValue: expectation.calculated,
    })}`);
  }
  console.log(`PASS ${expectation.name}`);
}

const tableFile = Bun.file(resolve(directory, "spreadsheet-table.xlsx"));
if (!await tableFile.exists()) throw new Error("LibreOffice did not produce spreadsheet-table.xlsx.");
const tableArtifact = openSpreadsheetArtifact(new Uint8Array(await tableFile.arrayBuffer()));
const table = tableArtifact.worksheet.tables[0];
if (table?.displayName !== "SampleData" || table.columns.map((column) => column.name).join(",") !== "Item,Value,Status") {
  throw new Error("spreadsheet-table.xlsx did not preserve its table definition.");
}
const projection = projectSpreadsheetTable(tableArtifact.worksheet, table);
if (projection.rows.join(",") !== "4,2" || tableArtifact.worksheet.cell("B4")?.value.value !== 9) {
  throw new Error(`spreadsheet-table.xlsx did not preserve its read-only table view: ${JSON.stringify(projection)}`);
}
console.log("PASS spreadsheet-table.xlsx");

const formulaFile = Bun.file(resolve(directory, "spreadsheet-formulas.xlsx"));
if (!await formulaFile.exists()) throw new Error("LibreOffice did not produce spreadsheet-formulas.xlsx.");
const formulaArtifact = openSpreadsheetArtifact(new Uint8Array(await formulaFile.arrayBuffer()));
for (const reference of ["D5", "D6", "D7"] as const) {
  const cached = formulaArtifact.worksheet.cell(reference)?.value;
  const calculated = formulaArtifact.calculation.value(reference);
  if (cached?.type !== "string" || cached.value !== "OK" || calculated?.type !== "string" || calculated.value !== cached.value) {
    throw new Error(`spreadsheet-formulas.xlsx disagrees with LibreOffice at ${reference}.`);
  }
}
const cachedTotal = formulaArtifact.worksheet.cell("C10")?.value;
const calculatedTotal = formulaArtifact.calculation.value("C10");
if (cachedTotal?.type !== "number" || cachedTotal.value !== 18 || calculatedTotal?.type !== "number" || calculatedTotal.value !== cachedTotal.value) {
  throw new Error("spreadsheet-formulas.xlsx disagrees with LibreOffice at C10.");
}
console.log("PASS spreadsheet-formulas.xlsx");
