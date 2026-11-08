import { describe, expect, test } from "bun:test";
import type { FormulaExpression } from "../src/ast.ts";
import type { FormulaScalarValue } from "../src/evaluator.ts";
import { parseFormula } from "../src/parser.ts";
import {
  functionError,
  functionNumber,
  functionScalar,
  type FunctionContext,
  type FunctionReference,
  type FunctionValue,
} from "../src/function-runtime.ts";
import { compatibilityFunctions } from "../src/functions/compatibility.ts";
import { cases, type CompatibilityCase } from "./fixtures/compatibility.ts";

/** Deliberately local adapter: parent owns evaluator integration and document tests. */
function context(
  fixture: Partial<CompatibilityCase> = {},
  maxArrayCells = 10000,
  budget = 1000000,
): FunctionContext {
  const cells = fixture.cells ?? {};
  const get = (row: number, column: number): FormulaScalarValue =>
    cells[`${String.fromCharCode(64 + column)}${row}`] ?? { type: "blank" };
  const reference = (
    e: FormulaExpression,
  ): FunctionReference | FormulaScalarValue => {
    if (e.kind !== "reference") return functionError("#REF!");
    const end = e.endReference ?? e.startReference;
    return {
      sheet: e.sheet ?? "Inputs",
      firstRow: e.startReference.row,
      firstColumn: e.startReference.column,
      height: end.row - e.startReference.row + 1,
      width: end.column - e.startReference.column + 1,
    };
  };
  const readReference = (r: FunctionReference): FunctionValue => {
    if (r.height * r.width > maxArrayCells) throw new Error("array budget");
    if (r.height === 1 && r.width === 1) return get(r.firstRow, r.firstColumn);
    return {
      kind: "array",
      rows: Array.from({ length: r.height }, (_, i) =>
        Array.from({ length: r.width }, (_, j) =>
          get(r.firstRow + i, r.firstColumn + j),
        ),
      ),
    };
  };
  const c: FunctionContext = {
    address: { sheet: "Results", row: 1, column: 1 },
    source: {
      formulaCells: [],
      cell: () => undefined,
      resolveSheet: (_, name) => name,
    },
    dateSystem: fixture.dateSystem ?? "1900",
    maxArrayCells,
    services: undefined,
    reference,
    readReference,
    cell: () => undefined,
    operation: (n = 1) => {
      budget -= n;
      if (budget < 0) throw new Error("operation budget");
    },
    now: () => new Date("2026-01-01T00:00:00Z"),
    random: () => 0.5,
    unavailable: () => {
      throw new Error("unavailable");
    },
    withBindings: () => {
      throw new Error("unused");
    },
    call: (name, args) => {
      const expressions = args.map(
        (_, i) =>
          ({
            kind: "number",
            value: i,
            lexical: String(i),
            start: 0,
            end: 0,
          }) as const,
      );
      const child = {
        ...c,
        evaluate: (e: FormulaExpression) =>
          args[(e as { value: number }).value]!,
      };
      return compatibilityFunctions.get(name)!(expressions, child);
    },
    evaluate: (e) => {
      switch (e.kind) {
        case "number":
        case "string":
        case "boolean":
        case "error":
          return { type: e.kind, value: e.value } as FormulaScalarValue;
        case "reference": {
          const r = reference(e);
          return "sheet" in r ? readReference(r) : r;
        }
        case "function": {
          const handler = compatibilityFunctions.get(e.name);
          if (!handler) throw new Error(`unexpected function ${e.name}`);
          return handler(e.arguments, c);
        }
        case "unary": {
          const v = functionScalar(c.evaluate(e.operand));
          return v.type === "number"
            ? functionNumber(e.operator === "-" ? -v.value : v.value)
            : v;
        }
        case "binary": {
          const a = functionScalar(c.evaluate(e.left)),
            b = functionScalar(c.evaluate(e.right));
          if (a.type === "error") return a;
          if (b.type === "error") return b;
          if (a.type !== "number" || b.type !== "number")
            return functionError();
          switch (e.operator) {
            case "+":
              return functionNumber(a.value + b.value);
            case "-":
              return functionNumber(a.value - b.value);
            case "*":
              return functionNumber(a.value * b.value);
            case "/":
              return functionNumber(a.value / b.value);
            default:
              throw new Error("unused operator");
          }
        }
        case "percent": {
          const v = functionScalar(c.evaluate(e.operand));
          return v.type === "number" ? functionNumber(v.value / 100) : v;
        }
      }
    },
  };
  return c;
}
function run(formula: string, c = context()): FunctionValue {
  return c.evaluate(parseFormula(formula).expression);
}
function close(actual: FunctionValue, expected: number, tolerance = 1e-12) {
  expect("type" in actual && actual.type).toBe("number");
  if ("type" in actual && actual.type === "number")
    expect(Math.abs(actual.value - expected)).toBeLessThanOrEqual(
      tolerance * Math.max(Math.abs(expected), 1e-300),
    );
}

describe("Excel compatibility corpus", () => {
  for (const fixture of cases)
    test(fixture.name, () => {
      const actual = run(fixture.formula, context(fixture));
      const expected = fixture.expected;
      const compare = (value: FunctionValue, wanted: FormulaScalarValue) => {
        if (wanted.type === "number") {
          expect("type" in value && value.type).toBe("number");
          if ("type" in value && value.type === "number")
            expect(Math.abs(value.value - wanted.value)).toBeLessThanOrEqual(
              fixture.tolerance ?? Math.max(1, Math.abs(wanted.value)) * 1e-12,
            );
        } else expect(value).toEqual(wanted);
      };
      if ("type" in expected) compare(actual, expected);
      else {
        expect("kind" in actual && actual.kind).toBe("array");
        if ("kind" in actual && actual.kind === "array") {
          expect(actual.rows.length).toBe(expected.length);
          expected.forEach((row, i) => {
            expect(actual.rows[i]!.length).toBe(row.length);
            row.forEach((wanted, j) => compare(actual.rows[i]![j]!, wanted));
          });
        }
      }
    });
  test("all forty names have numeric and domain fixtures", () => {
    expect(compatibilityFunctions.size).toBe(40);
    for (const name of compatibilityFunctions.keys()) {
      expect(
        cases.some(
          (x) =>
            x.name === name.toLowerCase() + "-success" &&
            "type" in x.expected &&
            x.expected.type === "number",
        ),
      ).toBe(true);
      expect(
        cases.some(
          (x) =>
            x.name === name.toLowerCase() + "-domain" &&
            "type" in x.expected &&
            x.expected.type === "error",
        ),
      ).toBe(true);
    }
  });
  for (const name of compatibilityFunctions.keys())
    test(name + " rejects wrong arity", () => {
      expect(compatibilityFunctions.get(name)!([], context())).toEqual(
        functionError(),
      );
      const expr = parseFormula("1").expression;
      expect(
        compatibilityFunctions.get(name)!(Array(256).fill(expr), context()),
      ).toEqual(functionError());
    });
  test("reference values exclude boolean/text/blank in aggregates", () => {
    const c = context({
      cells: {
        A1: { type: "number", value: 1 },
        A2: { type: "string", value: "2" },
        A3: { type: "boolean", value: true },
        A5: { type: "number", value: 3 },
      },
    });
    close(run("VAR(Inputs!A1:A5)", c), 2);
    close(run('VAR("1",TRUE,3)'), 4 / 3);
  });
  test("array values ignore text and logical values", () => {
    const c = context();
    close(
      c.call("VAR", [
        {
          kind: "array",
          rows: [
            [
              { type: "number", value: 1 },
              { type: "boolean", value: true },
              { type: "string", value: "3" },
              { type: "number", value: 3 },
            ],
          ],
        },
      ]),
      2,
    );
  });
  test("pairwise covariance excludes nonnumeric pairs", () => {
    const c = context({
      cells: {
        A1: { type: "number", value: 1 },
        A2: { type: "string", value: "9" },
        A3: { type: "number", value: 3 },
        B1: { type: "number", value: 2 },
        B2: { type: "number", value: 10 },
        B3: { type: "number", value: 4 },
      },
    });
    close(run("COVAR(Inputs!A1:A3,Inputs!B1:B3)", c), 1);
  });
  test("reference errors propagate in paired tests", () => {
    const c = context({
      cells: {
        A1: { type: "error", value: "#DIV/0!" },
        A2: { type: "number", value: 2 },
        B1: { type: "number", value: 2 },
        B2: { type: "number", value: 3 },
      },
    });
    expect(run("TTEST(Inputs!A1:A2,Inputs!B1:B2,2,1)", c)).toEqual(
      functionError("#DIV/0!"),
    );
  });
  test("announced omitted values select optional defaults", () => {
    const c = context();
    // This branch predates the shared omitted union member; do not redefine it here.
    const omitted = { kind: "omitted" } as unknown as FunctionValue;
    const num = (value: number): FunctionValue => ({ type: "number", value });
    close(
      c.call("BETADIST", [num(0.5), num(2), num(2), omitted, omitted]),
      0.5,
    );
    close(
      c.call("PERCENTRANK", [
        {
          kind: "array",
          rows: [
            [
              num(1) as FormulaScalarValue,
              num(2) as FormulaScalarValue,
              num(4) as FormulaScalarValue,
            ],
          ],
        },
        num(2),
        omitted,
      ]),
      0.5,
    );
    close(
      c.call("ZTEST", [
        {
          kind: "array",
          rows: [
            [
              { type: "number", value: 1 },
              { type: "number", value: 2 },
              { type: "number", value: 3 },
            ],
          ],
        },
        num(2),
        omitted,
      ]),
      0.5,
    );
  });
  test("density computation avoids overflow and underflow in intermediate scale ratios", () => {
    close(run("GAMMADIST(1E-300,1,1E300,FALSE)"), 1e-300, 1e-12);
    close(run("WEIBULL(1E-300,1,1E300,FALSE)"), 1e-300, 1e-12);
    close(run("GAMMADIST(1E300,2,1E-300,FALSE)"), 0);
    close(run("WEIBULL(1E300,2,1E-300,FALSE)"), 0);
  });
  test("scalar distributions broadcast rows and columns with cellwise errors", () => {
    const c = context();
    const a: FunctionValue = {
      kind: "array",
      rows: [[{ type: "number", value: 1 }], [{ type: "number", value: -1 }]],
    };
    const b: FunctionValue = {
      kind: "array",
      rows: [
        [
          { type: "number", value: 1 },
          { type: "number", value: 2 },
        ],
      ],
    };
    expect(c.call("CEILING", [a, b])).toEqual({
      kind: "array",
      rows: [
        [
          { type: "number", value: 1 },
          { type: "number", value: 2 },
        ],
        [
          { type: "number", value: -1 },
          { type: "number", value: 0 },
        ],
      ],
    });
    expect(context({}, 3).call("CEILING", [a, b])).toEqual(
      functionError("#NUM!"),
    );
  });
  test("array and operation budgets are enforced", () => {
    const args = [parseFormula("1").expression];
    const c = context({}, 2);
    const arr = {
      kind: "array",
      rows: [Array(3).fill({ type: "number", value: 1 })],
    } as const;
    expect(
      compatibilityFunctions.get("VAR")!(args, { ...c, evaluate: () => arr }),
    ).toEqual(functionError("#NUM!"));
    expect(() => run("NORMSINV(1E-100)", context({}, 100, 2))).toThrow(
      "operation budget",
    );
  });
  test("tails retain relative accuracy far below ordinary absolute tolerances", () => {
    close(run("NORMSDIST(-10)"), 7.61985302416047e-24, 1e-12);
    close(run("NORMSINV(1E-100)"), -21.273453560965322, 1e-13);
    close(run("EXPONDIST(1E-15,1,TRUE)"), 9.999999999999995e-16, 1e-14);
    close(run("GAMMAINV(.1,.1,1)"), 6.073048362743206e-11, 1e-12);
  });
  test("inverse distributions round trip at interior and near boundaries", () => {
    for (const p of [1e-12, 1e-5, 0.1, 0.5, 0.9, 1 - 1e-10]) {
      close(run(`BETADIST(BETAINV(${p},2,5),2,5)`), p, 2e-10);
      close(run(`GAMMADIST(GAMMAINV(${p},2,4),2,4,TRUE)`), p, 2e-10);
      close(run(`CHIDIST(CHIINV(${p},5),5)`), p, 2e-10);
      close(run(`FDIST(FINV(${p},5,7),5,7)`), p, 2e-10);
      close(run(`TDIST(TINV(${p},5),5,2)`), p, 2e-10);
    }
  });
});
