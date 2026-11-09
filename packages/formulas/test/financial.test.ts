import { describe, expect, test } from "bun:test";
import { parseFormula } from "../src/parser.ts";
import type { FormulaExpression } from "../src/ast.ts";
import type { FormulaScalarValue } from "../src/evaluator.ts";
import {
  functionError,
  functionNumber,
  type FunctionContext,
  type FunctionValue,
} from "../src/function-runtime.ts";
import { financialFunctions } from "../src/functions/financial.ts";
import { cases } from "./fixtures/financial.ts";

// Local dispatcher exercises the actual parser/AST and shared context contract.
function context(
  cells: Record<string, FormulaScalarValue> = {},
  dateSystem: "1900" | "1904" = "1900",
  budget = 100000,
): FunctionContext {
  let remaining = budget;
  const ctx: FunctionContext = {
    address: { sheet: "Results", row: 1, column: 1 },
    source: {
      formulaCells: [],
      cell: () => undefined,
      resolveSheet: (_, name) => name,
    },
    dateSystem,
    maxArrayCells: 10000,
    services: undefined,
    evaluate(e: FormulaExpression): FunctionValue {
      ctx.operation();
      switch (e.kind) {
        case "number":
        case "boolean":
        case "string":
        case "error":
          return { type: e.kind, value: e.value } as FormulaScalarValue;
        case "unary": {
          const a = ctx.evaluate(e.operand);
          return !("kind" in a) && a.type === "number"
            ? functionNumber(e.operator === "-" ? -a.value : a.value)
            : functionError();
        }
        case "percent": {
          const a = ctx.evaluate(e.operand);
          return !("kind" in a) && a.type === "number"
            ? functionNumber(a.value / 100)
            : functionError();
        }
        case "function":
          return (
            financialFunctions.get(e.name.toUpperCase())?.(e.arguments, ctx) ??
            functionError("#NAME?")
          );
        case "reference": {
          const rows: FormulaScalarValue[][] = [];
          for (
            let r = e.startReference.row;
            r <= (e.endReference?.row ?? e.startReference.row);
            r++
          ) {
            const row: FormulaScalarValue[] = [];
            for (
              let col = e.startReference.column;
              col <= (e.endReference?.column ?? e.startReference.column);
              col++
            )
              row.push(
                cells[`${String.fromCharCode(64 + col)}${r}`] ?? {
                  type: "blank",
                },
              );
            rows.push(row);
          }
          return e.endReference ? { kind: "array", rows } : rows[0]![0]!;
        }
        default:
          throw new Error(`Test dispatcher does not support ${e.kind}`);
      }
    },
    call() {
      throw new Error("Unexpected cross-category call");
    },
    withBindings() {
      throw new Error("Unexpected binding");
    },
    reference() {
      throw new Error("Unexpected reference geometry");
    },
    readReference() {
      throw new Error("Unexpected reference read");
    },
    cell() {
      return undefined;
    },
    operation(n = 1) {
      remaining -= n;
      if (remaining < 0) throw new Error("operation budget");
    },
    now() {
      return new Date("2020-01-01T00:00:00Z");
    },
    random() {
      return 0.5;
    },
    unavailable() {
      throw new Error("Unexpected unavailable capability");
    },
  };
  return ctx;
}
function run(formula: string, ctx = context()): FunctionValue {
  return ctx.evaluate(parseFormula(formula).expression);
}
function close(formula: string, expected: number, tolerance = 1e-9): void {
  const v = run(formula);
  expect(v).toMatchObject({ type: "number" });
  if (!("kind" in v) && v.type === "number")
    expect(Math.abs(v.value - expected)).toBeLessThanOrEqual(
      tolerance * Math.max(1, Math.abs(expected)),
    );
}
describe("financial workbook corpus", () => {
  for (const fixture of cases)
    test(fixture.name, () => {
      const actual = run(
        fixture.formula,
        context(fixture.cells, fixture.dateSystem),
      );
      if (fixture.expected.type === "number") {
        expect(actual).toMatchObject({ type: "number" });
        if (!("kind" in actual) && actual.type === "number")
          expect(
            Math.abs(actual.value - fixture.expected.value),
          ).toBeLessThanOrEqual(
            fixture.tolerance ??
              1e-9 * Math.max(1, Math.abs(fixture.expected.value)),
          );
      } else expect(actual).toEqual(fixture.expected);
    });
  test("all 55 functions have numeric and domain-error fixtures", () => {
    expect(financialFunctions.size).toBe(55);
    for (const name of financialFunctions.keys()) {
      expect(
        cases.some(
          (c) =>
            c.name === `financial ${name} success` &&
            c.expected.type === "number",
        ),
      ).toBe(true);
      expect(
        cases.some(
          (c) =>
            c.name === `financial ${name} domain` &&
            c.expected.type === "error",
        ),
      ).toBe(true);
    }
  });
});
describe("financial boundaries and identities", () => {
  test("every handler rejects missing and excessive arguments and propagates errors", () => {
    for (const [name, fn] of financialFunctions) {
      expect(fn([], context())).toEqual(functionError());
      const expr = parseFormula("1").expression;
      expect(fn(Array(256).fill(expr), context())).toEqual(functionError());
      const fixture = cases.find(
        (c) => c.name === `financial ${name} success`,
      )!;
      const expression = parseFormula(fixture.formula).expression;
      if (expression.kind !== "function") throw new Error("fixture shape");
      const args = [...expression.arguments];
      args[0] = parseFormula("#REF!").expression;
      expect(fn(args, context(fixture.cells))).toEqual(functionError("#REF!"));
    }
  });
  test("stable small-rate annuities and loan amortization", () => {
    for (const r of [0, 1e-14, 0.001, 0.1, -0.01]) {
      close(`PV(${r},12,PMT(${r},12,1000))`, 1000);
      close(`FV(${r},12,PMT(${r},12,1000),1000)`, 0);
    }
    close("CUMPRINC(0.01,24,1000,1,24,1)", -1000);
    close("PPMT(0.1,2,2,100,0,1)", -47.61904761904762);
  });
  test("RATE and IRR converge for negative and high returns", () => {
    close("RATE(2,0,-100,81)", -0.1);
    close("RATE(2,0,-100,900)", 2);
    expect(
      run(
        "IRR(Inputs!A1:A2)",
        context({ A1: functionNumber(-100), A2: functionNumber(110) }),
      ),
    ).toMatchObject({ type: "number", value: expect.closeTo(0.1, 8) });
  });
  test("invalid guesses, numeric overflow and no-root results", () => {
    expect(run("RATE(2,0,100,121)")).toEqual(functionError("#NUM!"));
    expect(run("RATE(2,0,-100,121,0,-1)")).toEqual(functionError("#NUM!"));
    expect(run("PMT(0,10,100,0,2)")).toEqual(functionError("#NUM!"));
    expect(run("FV(1e308,10,1)")).toEqual(functionError("#NUM!"));
  });
  test("range and scalar coercion differ for cash-flow aggregations", () => {
    expect(run('NPV(0,"10",TRUE)')).toEqual(functionNumber(11));
    expect(run('PMT("bad",10,100)')).toEqual(functionError());
    const c = context({
      A1: { type: "boolean", value: true },
      A2: functionNumber(20),
    });
    expect(run("NPV(0,Inputs!A1:A2)", c)).toEqual(functionNumber(20));
    expect(run("FVSCHEDULE(100,Inputs!A1:A2)", c)).toEqual(functionError());
  });
  test("budget exhaustion escapes the numeric error boundary", () => {
    expect(() =>
      run("CUMIPMT(0.01,1e9,100,1,1e9,0)", context({}, "1900", 100)),
    ).toThrow("operation budget");
    expect(() => run("COUPNUM(1,2958465,4)", context({}, "1900", 100))).toThrow(
      "operation budget",
    );
  });
  test("cash-flow arrays obey maxArrayCells", () => {
    const c = context({ A1: functionNumber(1), A2: functionNumber(2) });
    Object.defineProperty(c, "maxArrayCells", { value: 1 });
    expect(run("NPV(0,Inputs!A1:A2)", c)).toEqual(functionError("#NUM!"));
  });
  test("all day count bases and coupon truncation", () => {
    close("COUPDAYS(43921,44197,2,0)", 180);
    close("COUPDAYS(43921,44197,2,1)", 182);
    close("COUPDAYS(43921,44197,2,2)", 180);
    close("COUPDAYS(43921,44197,2,3)", 182.5);
    close("COUPDAYS(43921.9,44197.9,2.9,4.9)", 180);
    expect(run("COUPDAYS(-1,44197,2)")).toEqual(functionError("#NUM!"));
    expect(run("COUPDAYS(43831,2958466,2)")).toEqual(functionError("#NUM!"));
  });
});

describe("financial context integration", () => {
  test("announced omitted-value convention uses optional defaults", () => {
    const c = context({ A1: functionNumber(-100), A2: functionNumber(110) }),
      evaluate = c.evaluate;
    // The coordinator owns parser omitted nodes. A marker delivers its announced
    // FunctionValue shape without modifying this branch's shared AST/runtime.
    c.evaluate = (expression) =>
      expression.kind === "number" && expression.value === 999
        ? ({ kind: "omitted" } as unknown as FunctionValue)
        : evaluate(expression);
    expect(run("PMT(0,10,100,999,1)", c)).toEqual(functionNumber(-10));
    expect(run("ACCRINT(43831,44013,43921,0.1,999,2)", c)).toEqual(
      functionNumber(25),
    );
    expect(run("IRR(Inputs!A1:A2,999)", c)).toMatchObject({
      type: "number",
      value: expect.closeTo(0.1, 8),
    });
  });
  test("native rectangular arrays flatten cash flows row by row", () => {
    const c = context(),
      evaluate = c.evaluate;
    c.evaluate = (e) =>
      e.kind === "reference"
        ? {
            kind: "array",
            rows: [
              [functionNumber(-100), functionNumber(50)],
              [{ type: "boolean", value: true }, functionNumber(60)],
            ],
          }
        : evaluate(e);
    expect(run("NPV(0,Inputs!A1:B2)", c)).toEqual(functionNumber(10));
    expect(run("IRR(Inputs!A1:B2)", c)).toMatchObject({ type: "number" });
  });
  test("dates may be unsorted after initial date and share 365-day exponents", () => {
    const c = context({
      A1: functionNumber(-100),
      A2: functionNumber(121),
      A3: functionNumber(110),
      B1: functionNumber(43831),
      B2: functionNumber(44561),
      B3: functionNumber(44196),
    });
    const result = run("XNPV(0.1,Inputs!A1:A3,Inputs!B1:B3)", c);
    expect(result).toMatchObject({
      type: "number",
      value: expect.closeTo(100, 8),
    });
  });
});
