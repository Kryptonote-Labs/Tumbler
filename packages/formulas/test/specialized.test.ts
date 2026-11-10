import { describe, expect, test } from "bun:test";
import type { FormulaExpression } from "../src/ast.ts";
import type { FormulaScalarValue } from "../src/evaluator.ts";
import type { FormulaFunctionServices, FunctionContext, FunctionValue } from "../src/function-runtime.ts";
import { specializedFunctions } from "../src/functions/specialized.ts";
import { parseFormula } from "../src/parser.ts";
import { cases } from "./fixtures/specialized.ts";

const n = (value: number): FormulaScalarValue => ({ type: "number", value });
const s = (value: string): FormulaScalarValue => ({ type: "string", value });
const error = (value: `#${string}`): FormulaScalarValue => ({ type: "error", value });
class Unavailable extends Error {}

function context(cells: Record<string, FormulaScalarValue> = {}, services?: FormulaFunctionServices): FunctionContext {
  let operations = 0;
  const source: FunctionContext["source"] = {
    formulaCells: [], resolveSheet: (_, name) => name,
    cell: address => ({ formula: undefined, value: cells[`${String.fromCharCode(64 + address.column)}${address.row}`] ?? { type: "blank" } }),
  };
  const ctx: FunctionContext = {
    evaluateAggregate(expression) { return this.evaluate(expression); },
    address: { sheet: "Results", row: 1, column: 1 }, source, services,
    dateSystem: "1900", maxArrayCells: 100,
    operation(count = 1) { operations += count; if (operations > 1000) throw new Error("operation budget"); },
    unavailable(message): never { throw new Unavailable(message); },
    now: () => new Date(0), random: () => 0.5,
    call() { throw new Error("unexpected call"); },
    withBindings() { throw new Error("unexpected bindings"); },
    reference() { throw new Error("unexpected geometry request"); },
    readReference() { throw new Error("unexpected geometry read"); },
    cell: address => source.cell(address),
    evaluate(expression) {
      if (["number", "string", "boolean", "error"].includes(expression.kind)) {
        const literal = expression as Extract<FormulaExpression, { value: unknown }>;
        return { type: literal.kind, value: literal.value } as FormulaScalarValue;
      }
      if (expression.kind === "reference") {
        return source.cell({ sheet: expression.sheet ?? "Results", row: expression.startReference.row, column: expression.startReference.column })!.value;
      }
      if (expression.kind === "function") {
        if (expression.name === "IFERROR") {
          const value = ctx.evaluate(expression.arguments[0]!);
          return !("kind" in value) && value.type === "error" ? ctx.evaluate(expression.arguments[1]!) : value;
        }
        const handler = specializedFunctions.get(expression.name);
        if (handler) return handler(expression.arguments, ctx);
      }
      throw new Error(`unsupported test expression ${expression.kind}`);
    },
  };
  return ctx;
}
function run(formula: string, ctx: FunctionContext): FunctionValue { return ctx.evaluate(parseFormula(formula).expression); }

// A finite lookup model, deliberately not a Python interpreter or live data feed.
function model(cells: Record<string, FormulaScalarValue> = {}): FormulaFunctionServices {
  return { invoke(name, args, address) {
    expect(address).toEqual({ sheet: "Results", row: 1, column: 1 });
    if (name === "FIELDVALUE") {
      const record = args[0]!;
      const field = args[1]!;
      if (!("kind" in record) && record.type === "string" && record.value === "Contoso" && !("kind" in field) && field.type === "string") {
        return ({ Price: n(125.5), Name: s("Contoso Corporation"), Date: n(45292) } as Record<string, FormulaScalarValue>)[field.value] ?? error("#FIELD!");
      }
      return error("#FIELD!");
    }
    const code = args[0]!;
    if (!("kind" in code) && code.type === "string") {
      switch (code.value) {
        case "1 + 2": return n(3);
        case "'Hello' + ' ' + 'World'": return s("Hello World");
        case "[[1, 2], [3, 4]]": return { kind: "array", rows: [[n(1), n(2)], [n(3), n(4)]] };
        case 'xl("Inputs!A1") * 2': { const v = cells.A1!; return v.type === "number" ? n(v.value * 2) : error("#PYTHON!"); }
        case "1 / 0": return error("#PYTHON!");
      }
    }
    return undefined;
  } };
}

describe("specialized host functions", () => {
  for (const fixture of cases) test(fixture.name, () => {
    const result = run(fixture.formula, context(fixture.cells, model(fixture.cells)));
    expect("kind" in result && result.kind === "array" ? result.rows : result).toEqual(fixture.expected);
  });

  for (const name of ["FIELDVALUE", "PY"]) {
    const formula = name === "PY" ? 'PY("1 + 2",0)' : 'FIELDVALUE(Inputs!A1,"Price")';
    test(`${name} absent and declining hosts preserve caches through unavailable`, () => {
      expect(() => run(formula, context())).toThrow(Unavailable);
      expect(() => run(formula, context({}, { invoke: () => undefined }))).toThrow(Unavailable);
    });
    test(`${name} checks service output bounds and numeric overflow`, () => {
      const result = (value: FunctionValue) => run(formula, context({}, { invoke: () => value }));
      expect(result(n(Infinity))).toEqual(error("#NUM!"));
      expect(result({ kind: "array", rows: [[n(NaN)]] })).toEqual(error("#NUM!"));
      expect(result({ kind: "array", rows: [] })).toEqual(error("#CALC!"));
      expect(result({ kind: "array", rows: [[n(1)], []] })).toEqual(error("#CALC!"));
      expect(() => result({ kind: "array", rows: [Array(101).fill(n(1))] })).toThrow(Unavailable);
      expect(result({ kind: "array", rows: [Array(100).fill(n(1))] })).toMatchObject({ kind: "array" });
      expect(result(n(Number.MAX_VALUE))).toEqual(n(Number.MAX_VALUE));
      expect(result(n(Number.MIN_VALUE))).toEqual(n(Number.MIN_VALUE));
    });
    test(`${name} preserves explicit service errors and charges operation budget`, () => {
      const ctx = context({}, { invoke: () => error("#CONNECT!") });
      expect(run(formula, ctx)).toEqual(error("#CONNECT!"));
      ctx.operation = () => { throw new Error("budget"); };
      expect(() => run(formula, ctx)).toThrow("budget");
    });
  }

  test("FIELDVALUE propagates input errors without requesting a host", () => {
    expect(run('FIELDVALUE(#N/A,"Price")', context())).toEqual(error("#N/A"));
  });
  test("FIELDVALUE rejects the shared omitted marker before invoking the service", () => {
    const ctx = context({}, { invoke() { throw new Error("must not invoke"); } });
    const expression = parseFormula('FIELDVALUE("record","Price")').expression;
    if (expression.kind !== "function") throw new Error("expected function");
    // The coordinator adds this variant to FunctionValue during integration.
    const omitted = { kind: "omitted" } as unknown as FunctionValue;
    expect(specializedFunctions.get("FIELDVALUE")!(expression.arguments, { ...ctx, evaluate: () => omitted })).toEqual(error("#VALUE!"));
  });
  test("FIELDVALUE does not coerce literal, reference, or array arguments", () => {
    const ctx = context({ A1: n(12) }, { invoke: (_, args) => { expect(args).toEqual([n(12), s("12")]); return n(9); } });
    expect(run('FIELDVALUE(Inputs!A1,"12")', ctx)).toEqual(n(9));
    const array: FunctionValue = { kind: "array", rows: [[s("Price"), s("Name")]] };
    const args = [parseFormula('"Contoso"').expression, parseFormula('"fields"').expression];
    const arrayCtx = context({}, { invoke: (_, values) => { expect(values).toEqual([s("Contoso"), array]); return array; } });
    expect(specializedFunctions.get("FIELDVALUE")!(args, { ...arrayCtx, evaluate: expr => expr === args[1] ? array : s("Contoso") })).toEqual(array);
  });
  test("PY accepts object mode without executing its source", () => {
    const code = '__import__("os").system("touch /tmp/should-never-run")';
    const ctx = context({}, { invoke: (name, values) => { expect(name).toBe("PY"); expect(values).toEqual([s(code), n(1)]); return s("host-owned-object:1"); } });
    expect(run(`PY("${code.replaceAll('"', '""')}",1)`, ctx)).toEqual(s("host-owned-object:1"));
  });
  test("PY rejects computed arguments without evaluating them", () => {
    const ctx = context({}, { invoke() { throw new Error("must not invoke"); } });
    const handler = specializedFunctions.get("PY")!;
    const expr = parseFormula('PY("a"&"b",0)').expression;
    if (expr.kind !== "function") throw new Error("expected function");
    expect(handler(expr.arguments, { ...ctx, evaluate() { throw new Error("must not evaluate"); } })).toEqual(error("#VALUE!"));
  });
  test("PY preserves indexed OOXML scripts pending importer resolution", () => {
    expect(() => run("PY(0,0)", context())).toThrow("OOXML Python script index");
  });
  test("both functions reject excess arguments before evaluating inputs", () => {
    expect(run('PY("1 + 2",0,1)', context())).toEqual(error("#VALUE!"));
    expect(run('FIELDVALUE("record","Price",1)', context())).toEqual(error("#VALUE!"));
  });
  test("PY requires exact numeric modes even near their boundaries", () => {
    for (const mode of [Number.EPSILON, 1 - Number.EPSILON, 1 + Number.EPSILON, Number.MAX_VALUE]) {
      expect(run(`PY("1 + 2",${mode})`, context())).toEqual(error("#VALUE!"));
    }
    expect(run('PY("1 + 2",FALSE)', context())).toEqual(error("#VALUE!"));
  });
  test("unsupported object results preserve caches and host exceptions remain visible", () => {
    expect(() => run('PY("1 + 2",1)', context({}, { invoke: () => ({ kind: "lambda", parameters: [], invoke: () => n(1) }) }))).toThrow(Unavailable);
    expect(() => run('PY("1 + 2",0)', context({}, { invoke() { throw new Error("host budget"); } }))).toThrow("host budget");
  });
  test("array blanks, booleans and error elements retain their values", () => {
    const value: FunctionValue = { kind: "array", rows: [[{ type: "blank" }, { type: "boolean", value: true }, error("#N/A")]] };
    expect(run('PY("data",0)', context({}, { invoke: () => value }))).toEqual(value);
  });
  test("FIELDVALUE leaves date serial interpretation to the host in both date systems", () => {
    for (const dateSystem of ["1900", "1904"] as const) {
      const ctx = context({ A1: s("Contoso") }, model());
      expect(run('FIELDVALUE(Inputs!A1,"Date")', { ...ctx, dateSystem })).toEqual(n(45292));
    }
  });
});
