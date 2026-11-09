import { expect, test } from "bun:test";
import { createSpreadsheet } from "../src/commands.ts";
import { SpreadsheetArtifact } from "../src/artifact.ts";
import { openSpreadsheet } from "../src/workbook.ts";
import { beginPackageTransaction } from "@tumblerjs/opc";
import { spreadsheetPrintPages } from "../src/print.ts";

function fixture(setup: string, area = "'Sheet1'!$B$2:$D$8") {
  const original = createSpreadsheet();
  const workbook = original.workbook;
  const sheet = original.worksheet;
  const source = sheet.document.source
    .replace(/<dimension[^>]*\/>/, '<dimension ref="A1:Z100"/>')
    .replace("</worksheet>", `${setup}</worksheet>`);
  const names = `<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">${area}</definedName></definedNames>`;
  const pkg = beginPackageTransaction(workbook.package)
    .replacePart(sheet.part.name, new TextEncoder().encode(source))
    .replacePart(
      workbook.part.name,
      new TextEncoder().encode(
        workbook.document.source.replace("</workbook>", `${names}</workbook>`),
      ),
    )
    .commitPackage();
  const reopened = openSpreadsheet(pkg);
  return new SpreadsheetArtifact(reopened, reopened.sheets[0]!);
}
test("saved print area excludes other cells and uses landscape A4 with saved margins", () => {
  const pages = spreadsheetPrintPages(
    fixture(
      '<pageMargins left="0.5" right="0.5" top="1" bottom="1"/><pageSetup paperSize="9" orientation="landscape" scale="80"/>',
    ),
  );
  expect(pages).toHaveLength(1);
  expect(pages[0]?.range).toEqual({ start: { row: 2, column: 2 }, end: { row: 8, column: 4 } });
  expect(pages[0]?.width).toBe(1122.52);
  expect(pages[0]?.margins.left).toBe(48);
  expect(pages[0]?.scale).toBe(0.8);
});
test("manual row breaks and multiple print areas create separate pages", () => {
  const pages = spreadsheetPrintPages(
    fixture(
      '<rowBreaks count="1"><brk id="4" man="1"/></rowBreaks>',
      "'Sheet1'!$B$2:$D$8,'Sheet1'!$F$2:$G$3",
    ),
  );
  expect(pages.map((p) => [p.range.start.row, p.range.end.row])).toEqual([
    [2, 4],
    [5, 8],
    [2, 3],
  ]);
});
test("fit-to-page scales a large saved area to one page", () => {
  const artifact = fixture(
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><pageSetup fitToWidth="1" fitToHeight="1"/>',
    "'Sheet1'!$A$1:$Z$100",
  );
  const pages = spreadsheetPrintPages(artifact);
  expect(pages).toHaveLength(1);
  expect(pages[0]!.scale).toBeLessThan(1);
});
test("whole column and row print areas use the populated bounds", () => {
  expect(spreadsheetPrintPages(fixture("", "'Sheet1'!$B:$D"))[0]?.range.start.column).toBe(2);
  expect(spreadsheetPrintPages(fixture("", "'Sheet1'!$2:$8"))[0]?.range.start.row).toBe(2);
});
test("fit page counts account for indivisible rows", () => {
  const artifact = fixture(
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><pageMargins left="0" right="0" top="0" bottom="10.6875"/><pageSetup fitToWidth="0" fitToHeight="3"/>',
    "'Sheet1'!$A$1:$A$4",
  );
  expect(spreadsheetPrintPages(artifact).length).toBeLessThanOrEqual(3);
});
