import { describe, expect, test } from "bun:test";
import type { FormulaExpression } from "../src/ast.ts";
import type { FormulaScalarValue } from "../src/evaluator.ts";
import type { FunctionContext, FunctionReference, FunctionValue } from "../src/function-runtime.ts";
import { functionError, functionScalar } from "../src/function-runtime.ts";
import { parseFormula } from "../src/parser.ts";
import { databaseFunctions } from "../src/functions/database.ts";
import { cases, type DatabaseFixture } from "./fixtures/database.ts";

const blank: FormulaScalarValue = { type: "blank" };
const n = (value: number): FormulaScalarValue => ({ type: "number", value });
const s = (value: string): FormulaScalarValue => ({ type: "string", value });
const e = (value: `#${string}`): FormulaScalarValue => ({ type: "error", value });
function context(cells: DatabaseFixture["cells"], options: { budget?: number; maxArrayCells?: number; computed?: boolean; dateSystem?: "1900" | "1904" } = {}): FunctionContext {
  let budget = options.budget ?? 1_000_000;
  const key = (row: number, column: number) => {
    let name = "";
    for (let c = column; c; c = Math.floor((c - 1) / 26)) name = String.fromCharCode(65 + (c - 1) % 26) + name;
    return name + row;
  };
  const ctx: FunctionContext = {
    address: { sheet: "Results", row: 1, column: 1 },
    source: { formulaCells: [], cell: () => undefined, resolveSheet: (_, name) => name },
    dateSystem: options.dateSystem ?? "1900", maxArrayCells: options.maxArrayCells ?? 100_000, services: undefined,
    operation(count = 1) { budget -= count; if (budget < 0) throw new Error("operation budget"); },
    cell(address) { return { formula: options.computed ? "A2>1" : undefined, value: cells[key(address.row, address.column)] ?? blank }; },
    reference(expression) {
      if (expression.kind !== "reference") return functionError();
      const first = expression.startReference, last = expression.endReference ?? first;
      return { sheet: expression.sheet ?? "Inputs", firstRow: first.row, firstColumn: first.column, height: last.row - first.row + 1, width: last.column - first.column + 1 };
    },
    readReference(ref: FunctionReference) {
      return { kind: "array", rows: Array.from({ length: ref.height }, (_, r) => Array.from({ length: ref.width }, (_, c) => cells[key(ref.firstRow + r, ref.firstColumn + c)] ?? blank)) };
    },
    evaluate(expression): FunctionValue {
      switch (expression.kind) {
        case "number": case "string": case "boolean": case "error": return { type: expression.kind, value: expression.value } as FormulaScalarValue;
        case "reference": {
          const ref = ctx.reference(expression);
          if (!("sheet" in ref)) return ref;
          if (ref.height === 1 && ref.width === 1) return cells[key(ref.firstRow, ref.firstColumn)] ?? blank;
          return ctx.readReference(ref);
        }
        case "function": return databaseFunctions.get(expression.name)!(expression.arguments, ctx);
        case "binary": {
          const left = functionScalar(ctx.evaluate(expression.left)), right = functionScalar(ctx.evaluate(expression.right));
          if (left.type !== "number" || right.type !== "number") throw new Error("unsupported test binary");
          if (expression.operator === "*") return n(left.value * right.value);
          if (expression.operator === "+") return n(left.value + right.value);
          throw new Error("unsupported test binary operator");
        }
        default: throw new Error("unsupported test AST");
      }
    },
    call() { throw new Error("unexpected cross-category call"); },
    withBindings() { throw new Error("unexpected bindings"); },
    unavailable(message): never { throw new Error(`unavailable: ${message}`); },
    now: () => new Date(0), random: () => 0.5,
  };
  return ctx;
}
function run(fixture: DatabaseFixture, options: Parameters<typeof context>[1] = {}): FunctionValue {
  // Only the local harness substitutes an empty input for comma gaps until the
  // coordinator implements omitted AST arguments. Exported XLSX formulas retain ',,'.
  const expression = parseFormula(fixture.formula.replaceAll(",,", ",Inputs!Z99,")).expression;
  return context(fixture.cells, { dateSystem: fixture.dateSystem ?? "1900", ...options }).evaluate(expression);
}
const base = cases[0]!;
function check(formula: string, expected: FormulaScalarValue, cells: DatabaseFixture["cells"] = {}, options: Parameters<typeof context>[1] = {}) {
  const result = run({ name: "unit", formula, expected, cells: { ...base.cells, ...cells } }, options);
  if (expected.type === "number" && !("kind" in result) && result.type === "number") {
    expect(Math.abs(result.value - expected.value)).toBeLessThanOrEqual(Math.max(1e-300, Math.abs(expected.value) * 2e-15));
  } else expect(result).toEqual(expected);
}
const formula = (name: string, field = '"Amount"', criteria = "Inputs!E1:E2") => `${name}(Inputs!A1:C6,${field},${criteria})`;

describe("database corpus (uncached XLSX-ready cases)", () => {
  for (const fixture of cases) test(fixture.name, () => {
    const actual = run(fixture);
    if (fixture.expected.type === "number" && !("kind" in actual) && actual.type === "number") {
      expect(Math.abs(actual.value - fixture.expected.value)).toBeLessThanOrEqual(fixture.tolerance ?? Math.max(1e-300, Math.abs(fixture.expected.value) * 2e-15));
    } else expect(actual).toEqual(fixture.expected);
  });
});

describe("database validation, reference coercion and criteria", () => {
  for (const name of databaseFunctions.keys()) {
    test(`${name}: argument arity, range shape, errors`, () => {
      check(`${name}()`, e("#VALUE!"));
      check(`${name}(Inputs!A1:C6,"Amount")`, e("#VALUE!"));
      check(`${name}(Inputs!A1:C6,"Amount",Inputs!E1:E2,0)`, e("#VALUE!"));
      check(`${name}(1,"Amount",Inputs!E1:E2)`, e("#VALUE!"));
      check(formula(name, "#N/A"), e("#N/A"));
      check(formula(name, "0"), e("#VALUE!"));
      check(formula(name, '"Amount"', "Inputs!E1"), e("#VALUE!"));
      check(formula(name, '"Amount"', "1"), e("#VALUE!"));
    });
    test(`${name}: matching errors and nonmatching errors`, () => {
      const expected = name === "DCOUNT" ? n(1) : name === "DCOUNTA" ? n(3) : name === "DGET" ? e("#NUM!") : e("#N/A");
      check(formula(name), expected, { B2: e("#N/A") });
      const result = run({ ...base, formula: formula(name), cells: { ...base.cells, B4: e("#N/A") } });
      expect(result).toEqual(name === "DGET" ? e("#NUM!") : baseResult(name));
    });
  }
  test("integrated omitted FunctionValue convention", () => {
    const ctx = context(base.cells);
    const expr = parseFormula(formula("DCOUNT")).expression;
    if (expr.kind !== "function") throw new Error("test AST");
    const original = ctx.evaluate;
    const adapted: FunctionContext = { ...ctx, evaluate(expression) {
      if (expression === expr.arguments[1]) return { kind: "omitted" } as unknown as FunctionValue;
      return original(expression);
    } };
    expect(databaseFunctions.get("DCOUNT")!(expr.arguments, adapted)).toEqual(n(3));
    expect(databaseFunctions.get("DSUM")!(expr.arguments, adapted)).toEqual(e("#VALUE!"));
  });
  test("exact, prefix, case, question mark, escaped tilde and text ordering", () => {
    check(formula("DSUM"), n(2), { E2: s("=NORTH") });
    check(formula("DSUM"), n(6), { E2: s("nOrTh") });
    check(formula("DSUM"), n(2), { E2: s("=N?rth") });
    check(formula("DSUM"), n(4), { A3: s("a~"), E2: s("=a~~") });
    check(formula("DSUM"), n(8), { E2: s(">=South") });
    check(formula("DSUM"), n(12), { E2: s("<>North") });
  });
  test("numeric comparisons exclude numeric text and do not coerce Boolean field values", () => {
    for (const [criterion, expected] of [[">=4", 12], ["<4", 2], ["<=4", 6], ["<>4", 10], ["=4", 4], [">4", 8]] as const) {
      check(formula("DSUM"), n(expected), { E1: s("Amount"), E2: s(criterion) });
    }
    check(formula("DCOUNT"), n(2), { B5: { type: "boolean", value: true } });
    check(formula("DCOUNTA"), n(3), { B5: s("") });
    check(formula("DSUM", "2"), n(6));
    check(formula("DSUM", '"2"'), e("#VALUE!"));
  });
  test("blank / nonblank, Boolean and error criteria", () => {
    check(formula("DCOUNTA"), n(0), { E1: s("Amount"), E2: s("=") });
    check(formula("DSUM"), n(14), { E1: s("Amount"), E2: s("<>") });
    check(formula("DSUM"), n(2), { A2: { type: "boolean", value: true }, E2: { type: "boolean", value: true } });
    check(formula("DSUM"), n(2), { A2: e("#N/A"), E2: e("#N/A") });
  });
  test("constant computed criteria and explicit unavailable for relative formulas", () => {
    check(formula("DSUM"), n(14), { E1: s("Predicate"), E2: { type: "boolean", value: true } });
    check(formula("DSUM"), n(0), { E1: s("Predicate"), E2: { type: "boolean", value: false } });
    expect(() => check(formula("DSUM"), n(0), { E1: s("Predicate") }, { computed: true })).toThrow("unavailable: Database computed criteria");
  });
  test("bounded allocations and operations, including hostile wildcard inputs", () => {
    check(formula("DSUM"), e("#NUM!"), {}, { maxArrayCells: 4 });
    expect(() => check(formula("DSUM"), n(6), {}, { budget: 10 })).toThrow("operation budget");
    expect(() => check(formula("DSUM"), n(0), { E2: s("*a".repeat(1000) + "b"), A2: s("a".repeat(5000)) }, { budget: 1000 })).toThrow("operation budget");
  });
  test("numeric extremes, singleton statistics and no-numeric fields", () => {
    check(formula("DMIN"), n(-1e308), { B2: n(-1e308), B3: n(1e308) });
    check(formula("DMAX"), n(1e308), { B2: n(-1e308), B3: n(1e308) });
    check(formula("DSUM"), n(0), { B2: n(-1e308), B3: n(1e308) });
    check(formula("DVARP"), n(2.5e-201), { B2: n(1e-100), B3: n(2e-100) });
    for (const name of ["DVAR", "DSTDEV"]) check(formula(name), e("#DIV/0!"), { B3: s("4") });
    for (const name of ["DVARP", "DSTDEVP"]) check(formula(name), n(0), { B3: s("4") });
    for (const name of ["DSUM", "DMAX", "DMIN", "DPRODUCT", "DCOUNT"]) check(formula(name, '"Team"'), n(0));
    check(formula("DGET"), { type: "boolean", value: true }, { E2: s("=northwest"), B3: { type: "boolean", value: true } });
  });
});
function baseResult(name: string): FormulaScalarValue {
  const fixture = cases.find(item => item.name === `${name}: prefix criteria and numeric-only field`);
  if (!fixture) throw new Error(name);
  return fixture.expected;
}
