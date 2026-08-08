import { describe, expect, test } from "bun:test";
import { compile } from "svelte/compiler";
import { spreadsheetFormulaBarEdit, spreadsheetFormulaBarText } from "../src/index.ts";

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

  test("shows formula source and literal lexical values", () => {
    expect(spreadsheetFormulaBarText({ address: { row: 7, column: 3 }, reference: "C7", styleIndex: 0, formula: "SUM(C5:C6)", value: { type: "number", value: 12, lexical: "12" } })).toBe("=SUM(C5:C6)");
    expect(spreadsheetFormulaBarText({ address: { row: 1, column: 1 }, reference: "A1", styleIndex: 0, formula: undefined, value: { type: "number", value: 1, lexical: "1.00" } })).toBe("1.00");
  });

  test("compiles an explicit accessible formula editor without autofill", async () => {
    const source = await Bun.file(new URL("../src/SpreadsheetFormulaBar.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "SpreadsheetFormulaBar.svelte", generate: "client", modernAst: true });
    expect(result.warnings).toEqual([]);
    expect(source).toContain('aria-label="Formula bar"');
    expect(source).toContain('autocomplete="off"');
    expect(source).toContain('spellcheck="false"');
  });
});
