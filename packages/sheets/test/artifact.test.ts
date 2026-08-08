import { describe, expect, test } from "bun:test";
import { openSpreadsheetArtifact, SpreadsheetError } from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

describe("spreadsheet artefact host boundary", () => {
  test("switches to a sheet containing formulas without cached results", () => {
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({ sheets: [
      { name: "About", sheetId: 1, relationshipId: "about", xml: `<worksheet xmlns="${namespace}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>About</t></is></c></row></sheetData></worksheet>` },
      { name: "Sample Data", sheetId: 2, relationshipId: "sample", xml: `<worksheet xmlns="${namespace}"><sheetData><row r="1"><c r="A1"><f>SUM(1,2)</f><v/></c></row></sheetData></worksheet>` },
    ] }));

    const selected = artifact.selectSheet("Sample Data");

    expect(selected.activeSheet.name).toBe("Sample Data");
    expect(selected.worksheet.cell("A1")).toMatchObject({ formula: "SUM(1,2)", value: { type: "blank" } });
  });

  test("opens, switches sheets, edits, and returns fresh renderable state", () => {
    const source = workbookBytes(1);
    const initial = openSpreadsheetArtifact(source);
    expect(initial.activeSheet.name).toBe("Data");
    expect(initial.worksheet.displayText("A1")).toBe("1");
    const notes = initial.selectSheet("Notes");
    expect(notes.worksheet.displayText("A1")).toBe("note 1");
    const edited = notes.editCell("B2", 42);
    expect(edited).not.toBe(notes);
    expect(edited.activeSheet.name).toBe("Notes");
    expect(edited.worksheet.displayText("B2")).toBe("42");
    expect(openSpreadsheetArtifact(edited.bytes(), { sheet: "Notes" }).worksheet.displayText("B2")).toBe("42");
  });

  test("writes formulas and exposes their calculated result immediately", () => {
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({
      sheets: [{
        name: "Data",
        sheetId: 1,
        relationshipId: "data",
        xml: `<worksheet xmlns="${namespace}"><sheetData><row r="1"><c r="A1"><v>2</v></c><c r="B1"><v>3</v></c></row></sheetData></worksheet>`,
      }],
    }));

    const edited = artifact.editFormula("C1", "SUM(A1:B1)");

    expect(edited.worksheet.cell("C1")).toMatchObject({ formula: "SUM(A1:B1)", value: { type: "blank" } });
    expect(edited.calculation.value("C1")).toEqual({ type: "number", value: 5, lexical: "5" });
    expect(edited.calculation.displayText("C1")).toBe("5");
    expect(openSpreadsheetArtifact(edited.bytes()).worksheet.cell("C1")?.formula).toBe("SUM(A1:B1)");
  });

  test("retains the active sheet across an agent-produced replacement", () => {
    const current = openSpreadsheetArtifact(workbookBytes(1), { sheet: "Notes" });
    const replaced = current.replace(workbookBytes(2));
    expect(replaced.activeSheet.name).toBe("Notes");
    expect(replaced.worksheet.displayText("A1")).toBe("note 2");
  });

  test("falls back to a visible sheet when a replacement removed the active sheet", () => {
    const current = openSpreadsheetArtifact(workbookBytes(1), { sheet: "Notes" });
    const replacement = buildWorkbookFixture({
      sheets: [{ name: "Replacement", sheetId: 9, relationshipId: "replacement", xml: sheetXml("ready", true) }],
    });
    expect(current.replace(replacement).activeSheet.name).toBe("Replacement");
  });

  test("returns the same session for semantic no-op edits and diagnoses unknown sheets", () => {
    const artifact = openSpreadsheetArtifact(workbookBytes(1));
    expect(artifact.editCell("A1", 1)).toBe(artifact);
    expect(() => artifact.selectSheet("Missing")).toThrow(SpreadsheetError);
  });
});

function workbookBytes(revision: number): Uint8Array {
  return buildWorkbookFixture({
    sheets: [
      { name: "Data", sheetId: 1, relationshipId: "data", xml: sheetXml(String(revision)) },
      { name: "Notes", sheetId: 2, relationshipId: "notes", xml: sheetXml(`note ${revision}`, true) },
    ],
  });
}

function sheetXml(value: string, text = false): string {
  return `<worksheet xmlns="${namespace}"><sheetData><row r="1"><c r="A1"${text ? ' t="inlineStr"><is><t>' : "><v>"}${value}${text ? "</t></is>" : "</v>"}</c></row></sheetData></worksheet>`;
}
