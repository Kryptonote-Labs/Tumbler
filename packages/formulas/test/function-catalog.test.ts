import { describe, expect, test } from "bun:test";
import { calculateFormulas, formulaFunctionCatalog, type FormulaCellInput, type FormulaWorkbookSource } from "../src/index.ts";
import { extendedFunctions } from "../src/extended-functions.ts";

const catalog = new Map(formulaFunctionCatalog.map(entry => [entry.name, entry]));

function diagnosticsFor(names: readonly string[]) {
  const cells = new Map<number, FormulaCellInput>(names.map((name, index) => [index + 1, { formula: `${name}()`, value: { type: "blank" } }]));
  const source: FormulaWorkbookSource = {
    formulaCells: [...cells].map(([row, cell]) => ({ address: { sheet: "Sheet1", row, column: 1 }, formula: cell.formula! })),
    cell: address => address.sheet === "Sheet1" && address.column === 1 ? cells.get(address.row) : undefined,
    resolveSheet: (_current, name) => name === "Sheet1" ? name : undefined,
  };
  return calculateFormulas(source).diagnostics;
}

describe("formula function catalog", () => {
  test("lists each function once, alphabetically", () => {
    const names = formulaFunctionCatalog.map(entry => entry.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([...names].sort());
  });

  test("covers core evaluator functions and every registered family function", () => {
    for (const name of ["SUM", "IF", "XLOOKUP", "STDEV.S", "TEXTJOIN", "LET", "NORM.DIST", "PMT"]) expect(catalog.has(name)).toBe(true);
    for (const name of extendedFunctions.keys()) expect(catalog.has(name)).toBe(true);
  });

  test("every catalogued function dispatches to an implementation", () => {
    const unsupported = diagnosticsFor([...catalog.keys()]).filter(diagnostic => diagnostic.code === "unsupported-function");
    expect(unsupported).toEqual([]);
    expect(diagnosticsFor(["NOTAFUNCTION"]).map(diagnostic => diagnostic.code)).toEqual(["unsupported-function"]);
  });

  test("marks only functions that cannot calculate without a host service as host-only", () => {
    for (const name of ["WEBSERVICE", "CUBEVALUE", "CALL", "STOCKHISTORY", "TRANSLATE", "IMAGE", "PY"]) expect(catalog.get(name)?.availability).toBe("host");
    // Partly local functions defer only some inputs to a host.
    for (const name of ["FILTERXML", "TEXT", "CHAR", "CELL", "INFO", "EUROCONVERT", "REGEXTEST"]) expect(catalog.get(name)?.availability).toBe("local");
  });

  test("assigns the family whose handler wins dispatch", () => {
    expect(catalog.get("STDEV")?.category).toBe("compatibility");
    expect(catalog.get("SUM")?.category).toBe("math");
    expect(catalog.get("AVERAGE")?.category).toBe("statistical");
    expect(catalog.get("NOW")?.category).toBe("date-time");
  });
});
