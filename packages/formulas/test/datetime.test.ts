import { describe, expect, test } from "bun:test";
import type { FormulaExpression } from "../src/ast.ts";
import type { FormulaScalarValue } from "../src/evaluator.ts";
import { datetimeFunctions } from "../src/functions/datetime.ts";
import { functionError, functionNumber, type FunctionContext, type FunctionValue } from "../src/function-runtime.ts";
import { parseFormula } from "../src/parser.ts";
import { cases } from "./fixtures/datetime.ts";

function context(cells: Record<string, FormulaScalarValue> = {}, dateSystem: "1900" | "1904" = "1900", now = "2024-01-01T12:00:00"): FunctionContext {
  let operations = 0;
  const read = (row: number, column: number) => cells[`${String.fromCharCode(64 + column)}${row}`] ?? { type: "blank" } as const;
  const c: FunctionContext = {
    evaluateAggregate(expression) { return this.evaluate(expression); },
    address: { sheet: "Results", row: 1, column: 1 }, dateSystem, maxArrayCells: 10000, services: undefined,
    source: { formulaCells: [], cell: () => undefined, resolveSheet: (_, name) => name },
    cell: () => undefined, now: () => new Date(now), random: () => 0.5,
    operation(n = 1) { operations += n; if (operations > 100000) throw new Error("operation budget"); },
    unavailable(message) { throw new Error(message); },
    withBindings() { throw new Error("not required"); },
    call(name, values) {
      const handler = datetimeFunctions.get(name); if (!handler) throw new Error(name);
      const tokens = values.map((_, i) => ({ kind: "number", value: i, lexical: String(i), start: 0, end: 0 } as const));
      return handler(tokens, { ...c, evaluate: expr => values[(expr as { value: number }).value]! });
    },
    reference(expr) {
      if (expr.kind !== "reference") return functionError();
      return { sheet: expr.sheet ?? "Inputs", firstRow: expr.startReference.row, firstColumn: expr.startReference.column, height: (expr.endReference?.row ?? expr.startReference.row) - expr.startReference.row + 1, width: (expr.endReference?.column ?? expr.startReference.column) - expr.startReference.column + 1 };
    },
    readReference(ref) {
      const rows = Array.from({ length: ref.height }, (_, r) => Array.from({ length: ref.width }, (_, col) => read(ref.firstRow + r, ref.firstColumn + col)));
      return ref.height === 1 && ref.width === 1 ? rows[0]![0]! : { kind: "array", rows };
    },
    evaluate(expr: FormulaExpression): FunctionValue {
      switch (expr.kind) {
        case "number": case "boolean": case "string": case "error": return { type: expr.kind, value: expr.value } as FormulaScalarValue;
        case "function": return datetimeFunctions.get(expr.name)!(expr.arguments, c);
        case "reference": { const ref = c.reference(expr); return "sheet" in ref ? c.readReference(ref) : ref; }
        case "unary": { const v = c.evaluate(expr.operand); return !("kind" in v) && v.type === "number" ? functionNumber(expr.operator === "-" ? -v.value : v.value) : functionError(); }
        case "binary": { const a = c.evaluate(expr.left), b = c.evaluate(expr.right); return !("kind" in a) && !("kind" in b) && a.type === "number" && b.type === "number" && expr.operator === "-" ? functionNumber(a.value - b.value) : functionError(); }
        default: return functionError();
      }
    },
  };
  return c;
}
describe("datetime fixture corpus", () => {
  for (const fixture of cases) test(fixture.name, () => {
    const c = context(fixture.cells, fixture.dateSystem, fixture.now);
    const actual = c.evaluate(parseFormula(fixture.formula).expression);
    if (!Array.isArray(fixture.expected) && fixture.expected.type === "number") {
      expect(actual).toMatchObject({ type: "number" });
      expect((actual as { value: number }).value).toBeCloseTo(fixture.expected.value, 10);
    } else expect(actual).toEqual(Array.isArray(fixture.expected) ? { kind: "array", rows: fixture.expected } : fixture.expected);
  });
});
describe("datetime bounds and array semantics", () => {
  test("every handler validates arity and propagates input errors", () => {
    const c = context();
    for (const [name, fn] of datetimeFunctions) {
      expect(fn(Array(5).fill(parseFormula("1").expression), c)).toEqual(functionError());
      if (!["NOW", "TODAY"].includes(name)) {
        const count = ["DATEDIF", "TIME"].includes(name) ? 3 : ["DAYS360", "YEARFRAC", "WORKDAY.INTL", "NETWORKDAYS.INTL"].includes(name) ? 2 : 1;
        expect(c.call(name, Array(count).fill(functionError("#DIV/0!")))).toEqual(functionError("#DIV/0!"));
      }
    }
  });
  test("broadcasts scalar functions over a rectangular reference", () => {
    const c = context({ A1: functionNumber(0.5), A2: functionNumber(0.75) });
    expect(c.evaluate(parseFormula("HOUR(Inputs!A1:A2)").expression)).toEqual({ kind: "array", rows: [[functionNumber(12)], [functionNumber(18)]] });
  });
  test("omitted optional arguments preserve defaults", () => {
    const c = context();
    const omitted = { kind: "omitted" } as unknown as FunctionValue;
    expect(c.call("WORKDAY.INTL", [functionNumber(45296), functionNumber(1), omitted])).toEqual(functionNumber(45299));
    expect(c.call("WEEKNUM", [functionNumber(44197), omitted])).toEqual(functionNumber(1));
    expect(c.call("YEARFRAC", [functionNumber(40909), functionNumber(41120), omitted])).toEqual(functionNumber(209 / 360));
  });
  test("enforces output budget before allocation", () => {
    const c = context({ A1: functionNumber(0.5), A2: functionNumber(0.75) });
    expect(datetimeFunctions.get("HOUR")!([parseFormula("Inputs!A1:A2").expression], { ...c, maxArrayCells: 1 })).toEqual(functionError("#NUM!"));
  });
  test("whole date-domain calculations stay within operation budget", () => {
    const c = context();
    const total = c.call("NETWORKDAYS.INTL", [functionNumber(0), functionNumber(2958465)]);
    expect(total).toMatchObject({ type: "number" });
    expect(c.call("WORKDAY.INTL", [functionNumber(0), total])).toMatchObject({ type: "number" });
  });
  test("all valid numeric weekend codes and masks agree", () => {
    const c = context();
    for (const code of [1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16, 17]) {
      expect(c.call("NETWORKDAYS.INTL", [functionNumber(45292), functionNumber(45298), functionNumber(code)])).toEqual(functionNumber(code < 10 ? 5 : 6));
    }
  });
  test("business-day inverse across both date systems and directions", () => {
    for (const system of ["1900", "1904"] as const) {
      const c = context({}, system);
      for (const offset of [-1000, -100, -7, -1, 1, 7, 100, 1000]) {
        const result = c.call("WORKDAY.INTL", [functionNumber(45292), functionNumber(offset)]);
        expect(result).toMatchObject({ type: "number" });
        const end = (result as { value: number }).value;
        const count = c.call("NETWORKDAYS.INTL", [functionNumber(offset > 0 ? 45293 : end), functionNumber(offset > 0 ? end : 45291)]);
        expect(count).toEqual(functionNumber(Math.abs(offset)));
      }
    }
  });
});
