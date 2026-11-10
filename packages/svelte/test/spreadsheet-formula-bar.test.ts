import { describe, expect, test } from "bun:test";
import { compile } from "svelte/compiler";
import { insertSpreadsheetFormulaFunction, spreadsheetFormulaBarEdit, spreadsheetFormulaBarText } from "../src/index.ts";

describe("Svelte spreadsheet formula bar", () => {
  test("reserves leading equals interpretation for the formula bar", () => {
    expect(spreadsheetFormulaBarEdit("C7", "=SUM(C5:C6)", undefined)).toEqual({
      kind: "formula",
      reference: "C7",
      formula: "SUM(C5:C6)",
    });
    expect(spreadsheetFormulaBarEdit("A1", "=literal", { address: { row: 1, column: 1 }, reference: "A1", styleIndex: 0, formula: undefined, value: { type: "string", value: "old", storage: "inline" } })).toEqual({
      kind: "formula",
      reference: "A1",
      formula: "literal",
    });
  });

  test("keeps non-formula bar input typed as ordinary cell values", () => {
    expect(spreadsheetFormulaBarEdit("A1", "42", undefined)).toEqual({ kind: "value", reference: "A1", value: 42 });
    expect(spreadsheetFormulaBarEdit("A1", "FALSE", undefined)).toEqual({ kind: "value", reference: "A1", value: false });
  });

  test("Text format preserves numeric-looking and leading-equals literals", () => {
    expect(spreadsheetFormulaBarEdit("A1", "001", undefined, undefined, true)).toEqual({ kind: "value", reference: "A1", value: "001" });
    expect(spreadsheetFormulaBarEdit("A1", "=literal", undefined, undefined, true)).toEqual({ kind: "value", reference: "A1", value: "=literal" });
  });

  test("identifies the original target sheet after the host switches worksheets", () => {
    expect(spreadsheetFormulaBarEdit("C7", "='Project Inputs'!B4", undefined, "Dashboard")).toEqual({
      kind: "formula",
      sheet: "Dashboard",
      reference: "C7",
      formula: "'Project Inputs'!B4",
    });
  });

  test("shows formula source and literal lexical values", () => {
    expect(spreadsheetFormulaBarText({ address: { row: 7, column: 3 }, reference: "C7", styleIndex: 0, formula: "SUM(C5:C6)", value: { type: "number", value: 12, lexical: "12" } })).toBe("=SUM(C5:C6)");
    expect(spreadsheetFormulaBarText({ address: { row: 1, column: 1 }, reference: "A1", styleIndex: 0, formula: undefined, value: { type: "number", value: 1, lexical: "1.00" } })).toBe("1.00");
  });

  test("inserts a function call with the caret between its parentheses", () => {
    expect(insertSpreadsheetFormulaFunction("", "SUM", 0, 0)).toEqual({ draft: "=SUM()", selectionStart: 5, selectionEnd: 5 });
    expect(insertSpreadsheetFormulaFunction("=A1+", "ROUND", 4, 4)).toEqual({ draft: "=A1+ROUND()", selectionStart: 10, selectionEnd: 10 });
    expect(insertSpreadsheetFormulaFunction("=SUM(B2:B9)", "ABS", 5, 10)).toEqual({ draft: "=SUM(ABS())", selectionStart: 9, selectionEnd: 9 });
  });

  test("keeps the leading equals and turns typed text into a formula", () => {
    expect(insertSpreadsheetFormulaFunction("=A1", "MAX", 0, 0).draft).toBe("=MAX()A1");
    expect(insertSpreadsheetFormulaFunction("2*", "PI", 2, 2)).toEqual({ draft: "=2*PI()", selectionStart: 6, selectionEnd: 6 });
    expect(() => insertSpreadsheetFormulaFunction("", "SUM(", 0, 0)).toThrow(TypeError);
  });

  test("compiles an explicit accessible formula editor without autofill", async () => {
    const source = await Bun.file(new URL("../src/SpreadsheetFormulaBar.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "SpreadsheetFormulaBar.svelte", generate: "client", modernAst: true });
    expect(result.warnings).toEqual([]);
    expect(source).toContain('aria-label="Formula bar"');
    expect(source).toContain('autocomplete="off"');
    expect(source).toContain('spellcheck="false"');
    expect(source).toContain("referencePick");
    expect(source).toContain("targetWorksheet.sheet.name");
  });
});
