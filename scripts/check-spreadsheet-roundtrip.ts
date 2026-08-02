import { resolve } from "node:path";
import { openSpreadsheetArtifact } from "../packages/sheets/src/index.ts";

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
  if (worksheet.cell("B2")?.formula !== "B1*2" || worksheet.cell("B2")?.value.value !== expectation.calculated) {
    throw new Error(`${expectation.name} did not preserve and recalculate its formula.`);
  }
  console.log(`PASS ${expectation.name}`);
}
