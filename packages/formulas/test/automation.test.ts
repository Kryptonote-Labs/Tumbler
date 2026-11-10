import { describe, expect, test } from "bun:test";
import type { FormulaExpression } from "../src/ast.ts";
import type { FormulaScalarValue } from "../src/evaluator.ts";
import { automationFunctions } from "../src/functions/automation.ts";
import { functionError, functionNumber, type FunctionContext, type FunctionValue } from "../src/function-runtime.ts";
import { parseFormula } from "../src/parser.ts";
import { cases, modeledAutomationServices } from "./fixtures/automation.ts";

function context(cells: Record<string, FormulaScalarValue> = {}, overrides: Partial<FunctionContext> = {}): FunctionContext {
  let operations = 0;
  const ctx: FunctionContext = {
    address: { sheet: "Results", row: 1, column: 1 },
    source: { formulaCells: [], cell: () => undefined, resolveSheet: (_current, name) => name },
    dateSystem: "1900", maxArrayCells: 100, services: undefined,
    operation(count = 1) { operations += count; if (operations > 10000) throw new Error("operation budget"); },
    unavailable(message): never { throw new Error(`unavailable: ${message}`); },
    now: () => new Date(0), random: () => 0.5,
    cell: () => undefined, reference: () => functionError(), readReference: () => functionError(),
    withBindings: () => functionError(),
    call(name, values) {
      // Already evaluated values need no competing runtime value representation.
      const expressions = values.map((value, index): FormulaExpression => ({ kind: "number", value: index, lexical: String(index), start: 0, end: 0 }));
      return automationFunctions.get(name)!(expressions, { ...ctx, evaluate: expression => values[(expression as { value: number }).value]! });
    },
    evaluate(expression) {
      switch (expression.kind) {
        case "number": return functionNumber(expression.value);
        case "string": return { type: "string", value: expression.value };
        case "boolean": return { type: "boolean", value: expression.value };
        case "error": return { type: "error", value: expression.value };
        case "reference": return cells[`A${expression.startReference.row}`] ?? { type: "blank" };
        case "unary": {
          const value = ctx.evaluate(expression.operand);
          if ("kind" in value || value.type !== "number") return functionError();
          return functionNumber(expression.operator === "-" ? -value.value : value.value);
        }
        case "function": {
          const handler = automationFunctions.get(expression.name.toUpperCase());
          if (!handler) throw new Error(`Test context cannot execute ${expression.name}`);
          return handler(expression.arguments, ctx);
        }
        default: throw new Error(`Test context cannot execute ${expression.kind}`);
      }
    },
    ...overrides,
  };
  return ctx;
}

function evaluate(formula: string, ctx = context()): FunctionValue {
  return ctx.evaluate(parseFormula(formula).expression);
}

describe("automation fixtures (pure and explicit host model profiles)", () => {
  for (const fixture of cases) test(fixture.name, () => {
    const result = evaluate(fixture.formula, context(fixture.cells, {
      services: fixture.name.startsWith("host model:") ? modeledAutomationServices : undefined,
      dateSystem: fixture.dateSystem ?? "1900",
    }));
    if (fixture.tolerance !== undefined && !Array.isArray(fixture.expected) && "type" in fixture.expected
      && fixture.expected.type === "number" && !("kind" in result) && result.type === "number") {
      expect(Math.abs(result.value - fixture.expected.value)).toBeLessThanOrEqual(fixture.tolerance);
    } else expect(result).toEqual("type" in fixture.expected ? fixture.expected : { kind: "array", rows: fixture.expected });
  });
});

test("all fourteen documented fixed rates work in both directions", () => {
  const rates: Record<string, number> = {
    EUR: 1, ATS: 13.7603, BEF: 40.3399, DEM: 1.95583, ESP: 166.386,
    FIM: 5.94573, FRF: 6.55957, IEP: 0.787564, ITL: 1936.27,
    LUF: 40.3399, NLG: 2.20371, PTE: 200.482, GRD: 340.750, SIT: 239.640,
  };
  for (const [code, rate] of Object.entries(rates)) {
    expect(evaluate(`EUROCONVERT(1,"EUR","${code}",TRUE)`)).toEqual(functionNumber(rate));
    expect(evaluate(`EUROCONVERT(${rate},"${code}","EUR",TRUE)`)).toEqual(functionNumber(1));
  }
});

test("absent or declining adapters preserve cache via unavailable", () => {
  for (const formula of ['CALL(42,21)', 'REGISTER.ID("Demo","Scale","BB")']) {
    expect(() => evaluate(formula)).toThrow("unavailable:");
    expect(() => evaluate(formula, context({}, { services: { invoke: () => undefined } }))).toThrow("unavailable:");
  }
});

test("adapter receives original typed arguments and formula address", () => {
  const received: unknown[] = [];
  const ctx = context({}, { services: { invoke(name, args, address) { received.push({ name, args, address }); return functionNumber(8); } } });
  expect(evaluate('CALL("Demo",1,"BB",TRUE)', ctx)).toEqual(functionNumber(8));
  expect(received).toEqual([{ name: "CALL", args: [
    { type: "string", value: "Demo" }, functionNumber(1), { type: "string", value: "BB" },
    { type: "boolean", value: true },
  ], address: ctx.address }]);
});

test("CALL marshals bounded P arrays and preserves returned errors", () => {
  const array: FunctionValue = { kind: "array", rows: [[functionNumber(1), functionNumber(2)]] };
  const ctx = context({}, { services: { invoke: (_name, values) => values[1] } });
  expect(ctx.call("CALL", [functionNumber(42), array])).toEqual(array);
  expect(ctx.call("CALL", [functionNumber(42), functionError("#DIV/0!")])).toEqual(functionError("#DIV/0!"));
});

test("array budget enforced on both host arguments and results", () => {
  const array: FunctionValue = { kind: "array", rows: [[functionNumber(1), functionNumber(2)]] };
  let called = false;
  const ctx = context({}, { maxArrayCells: 1, services: { invoke: () => { called = true; return array; } } });
  expect(() => ctx.call("CALL", [functionNumber(42), array])).toThrow("array cell budget");
  expect(called).toBe(false);
  expect(() => evaluate("CALL(42)", ctx)).toThrow("array cell budget");
});

test("EUROCONVERT rejects arrays per Microsoft contract", () => {
  const ctx = context();
  expect(ctx.call("EUROCONVERT", [
    { kind: "array", rows: [[functionNumber(1)]] }, { type: "string", value: "EUR" }, { type: "string", value: "DEM" },
  ])).toEqual(functionError());
});

test("invalid arities and header types do not invoke host", () => {
  const ctx = context({}, { services: { invoke: () => { throw new Error("must not invoke"); } } });
  for (const formula of ['REGISTER.ID(1,"Scale")', 'REGISTER.ID("Demo","Scale",1)', 'CALL(TRUE)', 'CALL(1.5)',
    'CALL("Demo",FALSE,"BB")', 'CALL("Demo",1,1)', 'EUROCONVERT(1,"EUR")', 'EUROCONVERT(1,"EUR","DEM",TRUE,3,1)']) {
    expect(evaluate(formula, ctx)).toEqual(functionError());
  }
});

test("half boundaries, symmetry, and extremes use bounded rounding", () => {
  for (const amount of [200000000000002, -200000000000002]) {
    expect(evaluate(`EUROCONVERT(${amount},"EUR","BEF",FALSE)`)).toEqual(evaluate(`EUROCONVERT(${amount},"EUR","BEF",TRUE)`));
  }
  expect(evaluate('EUROCONVERT(1.005,"BEF","LUF")')).toEqual(functionNumber(1));
  expect(evaluate('EUROCONVERT(0.5,"BEF","LUF")')).toEqual(functionNumber(1));
  expect(evaluate('EUROCONVERT(-0.5,"BEF","LUF")')).toEqual(functionNumber(-1));
  expect(evaluate('EUROCONVERT(0.499999999999,"BEF","LUF")')).toEqual(functionNumber(0));
  expect(evaluate('EUROCONVERT(1e-300,"FRF","EUR",TRUE,324)')).toEqual(functionNumber(1e-300 / 6.55957));
});

test("operation budget remains effective", () => {
  expect(() => evaluate('EUROCONVERT(1,"EUR","DEM")', context({}, { operation: () => { throw new Error("budget"); } }))).toThrow("budget");
});

test("shared omitted values default optional euro/registration arguments and marshal CALL arguments", () => {
  // Runtime integration owns adding the already agreed shared variant to its
  // union; this cast is temporary compatibility with the category baseline.
  const missing = { kind: "omitted" } as unknown as FunctionValue;
  const text = (value: string): FunctionValue => ({ type: "string", value });
  const ctx = context();
  expect(ctx.call("EUROCONVERT", [functionNumber(1), text("FRF"), text("EUR"), missing, functionNumber(3)])).toEqual(functionNumber(0.15));
  expect(ctx.call("EUROCONVERT", [functionNumber(1), text("FRF"), text("EUR"), { type: "boolean", value: true }, missing])).toEqual(functionNumber(1 / 6.55957));
  expect(ctx.call("EUROCONVERT", [missing, text("FRF"), text("EUR")])).toEqual(functionError());
  const registering = context({}, { services: modeledAutomationServices });
  expect(registering.call("REGISTER.ID", [text("Demo"), text("Scale"), missing])).toEqual(functionNumber(42));
  const received: FunctionValue[][] = [];
  const calling = context({}, { services: { invoke(_name, values) { received.push([...values]); return functionNumber(7); } } });
  expect(calling.call("CALL", [functionNumber(42), missing])).toEqual(functionNumber(7));
  expect(calling.call("CALL", [text("Demo"), text("Scale"), missing, missing])).toEqual(functionNumber(7));
  expect(received[0]![1]).toEqual(missing);
  expect(received[1]![2]).toEqual(missing);
});
