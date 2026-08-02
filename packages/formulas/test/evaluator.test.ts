import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  calculateFormulas,
  type FormulaCellAddress,
  type FormulaCellInput,
  type FormulaScalarValue,
  type FormulaWorkbookSource,
} from "../src/index.ts";

describe("bounded spreadsheet formula calculation", () => {
  test("calculates the generated document's IF and SUM formulas", () => {
    const workbook = source({
      "Sample Data!B5": value(13),
      "Sample Data!B6": value(4),
      "Sample Data!B7": value(1),
      "Sample Data!D5": formula(`IF(B5>0,"OK","Check")`),
      "Sample Data!D6": formula(`IF(B6>0,"OK","Check")`),
      "Sample Data!D7": formula(`IF(B7>0,"OK","Check")`),
      "Sample Data!C10": formula("SUM(B5:B7)"),
    });

    const calculation = calculateFormulas(workbook);

    expect(calculation.value(address("Sample Data!D5"))).toEqual({ type: "string", value: "OK" });
    expect(calculation.value(address("Sample Data!D6"))).toEqual({ type: "string", value: "OK" });
    expect(calculation.value(address("Sample Data!D7"))).toEqual({ type: "string", value: "OK" });
    expect(calculation.value(address("Sample Data!C10"))).toEqual({ type: "number", value: 18 });
    expect(calculation.dependencies(address("Sample Data!C10"))).toEqual([
      address("Sample Data!B5"), address("Sample Data!B6"), address("Sample Data!B7"),
    ]);
    expect(calculation.diagnostics).toEqual([]);
  });

  test("evaluates dependency order across sheets", () => {
    const workbook = source({
      "Inputs!A1": value(4),
      "Data Sheet!A1": formula("Inputs!A1*2"),
      "Data Sheet!A2": formula("A1+2"),
    });
    const calculation = calculateFormulas(workbook);
    expect(calculation.value(address("Data Sheet!A2"))).toEqual({ type: "number", value: 10 });
  });

  test("uses a source cache for unsupported dependencies without claiming it was calculated", () => {
    const workbook = source({
      "Sheet1!A1": formula("XLOOKUP(1,B1:B2,C1:C2)", { type: "number", value: 42 }),
      "Sheet1!A2": formula("A1+1"),
    });
    const calculation = calculateFormulas(workbook);
    expect(calculation.value(address("Sheet1!A1"))).toBeUndefined();
    expect(calculation.value(address("Sheet1!A2"))).toEqual({ type: "number", value: 43 });
    expect(calculation.diagnostics).toMatchObject([{ code: "unsupported-function", formula: "XLOOKUP(1,B1:B2,C1:C2)" }]);
  });

  test("keeps IF lazy and implements errors, aggregates, logicals, and coercion", () => {
    const workbook = source({
      "Sheet1!A1": formula("IF(TRUE,1,MISSING())"),
      "Sheet1!A2": formula("1/0"),
      "Sheet1!A3": formula("AVERAGE(1,2,3)"),
      "Sheet1!A4": formula("AND(1,TRUE,NOT(FALSE))"),
      "Sheet1!A5": formula(`"2"+3&"!"`),
      "Sheet1!A6": formula("MIN(4,2,9)+MAX(4,2,9)+COUNT(4,TRUE,\"x\")"),
    });
    const calculation = calculateFormulas(workbook);
    expect(calculation.value(address("Sheet1!A1"))).toEqual({ type: "number", value: 1 });
    expect(calculation.value(address("Sheet1!A2"))).toEqual({ type: "error", value: "#DIV/0!" });
    expect(calculation.value(address("Sheet1!A3"))).toEqual({ type: "number", value: 2 });
    expect(calculation.value(address("Sheet1!A4"))).toEqual({ type: "boolean", value: true });
    expect(calculation.value(address("Sheet1!A5"))).toEqual({ type: "string", value: "5!" });
    expect(calculation.value(address("Sheet1!A6"))).toEqual({ type: "number", value: 13 });
    expect(calculation.diagnostics).toEqual([]);
  });

  test("diagnoses cycles and keeps their cached values source-owned", () => {
    const calculation = calculateFormulas(source({
      "Sheet1!A1": formula("A2+1"),
      "Sheet1!A2": formula("A1+1"),
    }));
    expect(calculation.value(address("Sheet1!A1"))).toBeUndefined();
    expect(calculation.value(address("Sheet1!A2"))).toBeUndefined();
    expect(calculation.diagnostics.map(({ code }) => code)).toEqual(["circular-reference", "circular-reference"]);
  });

  test("bounds ranges, operations, depth, and formula inventory", () => {
    const workbook = source({ "Sheet1!A1": formula("SUM(A2:XFD1048576)") });
    const calculation = calculateFormulas(workbook, { maxRangeCells: 20 });
    expect(calculation.value(address("Sheet1!A1"))).toBeUndefined();
    expect(calculation.diagnostics[0]?.code).toBe("evaluation-limit");
    expect(() => calculateFormulas(workbook, { maxFormulaCells: 0 })).toThrow(RangeError);
  });

  test("matches generated arithmetic expressions", () => {
    fc.assert(fc.property(
      fc.integer({ min: -1_000_000, max: 1_000_000 }),
      fc.integer({ min: -1_000_000, max: 1_000_000 }),
      (left, right) => {
        const workbook = source({ "Sheet1!A1": formula(`(${left})+(${right})`) });
        expect(calculateFormulas(workbook).value(address("Sheet1!A1"))).toEqual({ type: "number", value: left + right });
      },
    ), { numRuns: 500 });
  });
});

function source(cells: Readonly<Record<string, FormulaCellInput>>): FormulaWorkbookSource {
  const entries = new Map(Object.entries(cells).map(([reference, cell]) => [key(address(reference)), cell]));
  const sheets = new Map(Object.keys(cells).map((reference) => {
    const sheet = reference.slice(0, reference.lastIndexOf("!"));
    return [sheet.toLocaleLowerCase("en-US"), sheet];
  }));
  return {
    formulaCells: [...entries].flatMap(([cellKey, cell]) => cell.formula === undefined ? [] : [{ address: addressFromKey(cellKey), formula: cell.formula }]),
    cell: (cellAddress) => entries.get(key(cellAddress)),
    resolveSheet: (_currentSheet, name) => sheets.get(name.toLocaleLowerCase("en-US")),
  };
}

function formula(source: string, cached: FormulaScalarValue = { type: "blank" }): FormulaCellInput {
  return { formula: source, value: cached };
}

function value(number: number): FormulaCellInput {
  return { formula: undefined, value: { type: "number", value: number } };
}

function address(reference: string): FormulaCellAddress {
  const separator = reference.lastIndexOf("!");
  const sheet = reference.slice(0, separator);
  const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(reference.slice(separator + 1))!;
  let column = 0;
  for (const character of match[1]!) column = column * 26 + character.charCodeAt(0) - 64;
  return { sheet, row: Number(match[2]), column };
}

function key(cellAddress: FormulaCellAddress): string {
  return `${cellAddress.sheet}\u0000${cellAddress.row}\u0000${cellAddress.column}`;
}

function addressFromKey(value: string): FormulaCellAddress {
  const [sheet, row, column] = value.split("\u0000");
  return { sheet: sheet!, row: Number(row), column: Number(column) };
}
