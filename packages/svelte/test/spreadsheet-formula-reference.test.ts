import { describe, expect, test } from "bun:test";
import {
  insertSpreadsheetFormulaReference,
  spreadsheetFormulaReferenceText,
} from "../src/index.ts";

describe("spreadsheet formula reference picking", () => {
  test("keeps same-sheet references compact and qualifies cross-sheet ranges", () => {
    const range = { start: { row: 5, column: 2 }, end: { row: 7, column: 2 } };
    expect(spreadsheetFormulaReferenceText({ sheet: "Dashboard", range }, "dashboard")).toBe("B5:B7");
    expect(spreadsheetFormulaReferenceText({ sheet: "Project Inputs", range }, "Dashboard"))
      .toBe("'Project Inputs'!B5:B7");
    expect(spreadsheetFormulaReferenceText({ sheet: "Budget", range }, "Dashboard")).toBe("Budget!B5:B7");
  });

  test("quotes ambiguous and apostrophe-containing worksheet names", () => {
    const range = { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } };
    expect(spreadsheetFormulaReferenceText({ sheet: "A1", range }, "Other")).toBe("'A1'!A1");
    expect(spreadsheetFormulaReferenceText({ sheet: "Owner's plan", range }, "Other"))
      .toBe("'Owner''s plan'!A1");
  });

  test("inserts at a caret and replaces the in-progress pick while dragging", () => {
    const initial = insertSpreadsheetFormulaReference("=SUM()", "Inputs!B5", 5, 5);
    expect(initial).toMatchObject({
      draft: "=SUM(Inputs!B5)",
      selectionStart: 14,
      selectionEnd: 14,
      insertedSpan: { start: 5, end: 14 },
    });

    const dragged = insertSpreadsheetFormulaReference(
      initial.draft,
      "Inputs!B5:B7",
      initial.selectionStart,
      initial.selectionEnd,
      initial.insertedSpan,
    );
    expect(dragged.draft).toBe("=SUM(Inputs!B5:B7)");
  });

  test("replaces a selected formula fragment and rejects invalid text offsets", () => {
    expect(insertSpreadsheetFormulaReference("=A1+old", "B2", 4, 7).draft).toBe("=A1+B2");
    expect(() => insertSpreadsheetFormulaReference("=A1", "B2", -1, 0)).toThrow(RangeError);
    expect(() => insertSpreadsheetFormulaReference("=A1", "B2", 0.5, 1)).toThrow(TypeError);
  });
});
