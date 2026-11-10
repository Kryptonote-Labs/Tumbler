import { expect, test } from "bun:test";
import { parseFormula } from "../src/parser.ts";
import type { FormulaExpression } from "../src/ast.ts";
import type { FormulaCellInput, FormulaScalarValue } from "../src/evaluator.ts";
import {
  functionError,
  functionFlatten,
  functionNumber,
  type FunctionContext,
  type FunctionValue,
  type FunctionReference,
} from "../src/function-runtime.ts";
import { lookupFunctions } from "../src/functions/lookup.ts";
import { cases } from "./fixtures/lookup.ts";
const n = functionNumber;
function context(
  cells: Record<string, FormulaScalarValue> = {},
  formulas: Record<string, string> = {},
  modeled = false,
): FunctionContext {
  let operations = 0;
  const input = (row: number, col: number): FormulaCellInput => {
    let label = "";
    while (col) {
      col--;
      label = String.fromCharCode(65 + (col % 26)) + label;
      col = Math.floor(col / 26);
    }
    const key = label + row;
    return { value: cells[key] ?? { type: "blank" }, formula: formulas[key] };
  };
  const c: FunctionContext = {
    evaluateAggregate(expression) { return this.evaluate(expression); },
    address: { sheet: "Results", row: 1, column: 1 },
    dateSystem: "1900",
    maxArrayCells: 10000,
    source: {
      formulaCells: [],
      cell: (a) => input(a.row, a.column),
      resolveSheet: (_, name) =>
        ["Inputs", "Results"].includes(name) ? name : undefined,
    },
    services: modeled
      ? {
          invoke: (name, args) =>
            name === "GETPIVOTDATA" &&
            JSON.stringify(args[1]) ===
              JSON.stringify({ type: "string", value: "Inputs!R1C1:R1C1" })
              ? n(125)
              : name === "RTD"
                ? n(42.5)
                : name === "IMAGE"
                  ? { type: "string", value: "[image: Product]" }
                  : undefined,
        }
      : undefined,
    evaluate: (e) => evaluate(e, c),
    call: (name, args) => {
      if (name === "SUM")
        return n(
          args
            .flatMap(functionFlatten)
            .reduce((sum, v) => sum + (v.type === "number" ? v.value : 0), 0),
        );
      throw Error("Unexpected call " + name);
    },
    withBindings: (bindings, e) => evaluate(e, c, bindings),
    reference: (e) => {
      if (e.kind !== "reference") return functionError();
      const start = e.startReference,
        end = e.endReference ?? start;
      return {
        sheet: e.sheet ?? "Results",
        firstRow: Math.min(start.row, end.row),
        firstColumn: Math.min(start.column, end.column),
        height: Math.abs(end.row - start.row) + 1,
        width: Math.abs(end.column - start.column) + 1,
      };
    },
    readReference: (r) => {
      c.operation(r.height * r.width);
      if (r.height * r.width > c.maxArrayCells) throw Error("budget");
      const rows = Array.from({ length: r.height }, (_, i) =>
        Array.from(
          { length: r.width },
          (_, j) => input(r.firstRow + i, r.firstColumn + j).value,
        ),
      );
      return r.height === 1 && r.width === 1
        ? rows[0]![0]!
        : { kind: "array", rows };
    },
    cell: (a) => input(a.row, a.column),
    operation: (count = 1) => {
      operations += count;
      if (operations > 1e6) throw Error("operation budget");
    },
    now: () => new Date("2026-01-01T00:00:00Z"),
    random: () => 0.5,
    unavailable: (message) => {
      throw Error("unavailable: " + message);
    },
  };
  return c;
}
function evaluate(
  e: FormulaExpression,
  c: FunctionContext,
  bindings: ReadonlyMap<string, FunctionValue> = new Map(),
): FunctionValue {
  if (
    e.kind === "number" ||
    e.kind === "string" ||
    e.kind === "boolean" ||
    e.kind === "error"
  )
    return { type: e.kind, value: e.value } as FormulaScalarValue;
  if (e.kind === "unary") {
    const v = evaluate(e.operand, c, bindings);
    return !("kind" in v) && v.type === "number"
      ? n(e.operator === "-" ? -v.value : v.value)
      : functionError();
  }
  if (e.kind === "reference") {
    const r = c.reference(e);
    return "sheet" in r ? c.readReference(r) : r;
  }
  if (e.kind === "function") {
    // The current parser represents bare names as zero-argument functions only after integration.
    if (e.name === "LAMBDA")
      throw Error("Lambda fixture must be handled by local preprocessing");
    const handler = lookupFunctions.get(e.name);
    if (handler) return handler(e.arguments, c);
    return c.call(
      e.name,
      e.arguments.map((x) => evaluate(x, c, bindings)),
    );
  }
  throw Error("Unsupported local expression " + e.kind);
}
function run(formula: string, c: FunctionContext): FunctionValue {
  // Contract-local substitution for LAMBDA(x,SUM(x)) until parser names/lambdas integrate.
  const substituted = formula
    .replaceAll("LAMBDA(x,SUM(x))", "999999")
    .replace(/(?<=[(,])(?=,)|(?<=,)(?=\))/g, "999998");
  const ast = parseFormula(substituted).expression;
  const extended: FunctionContext = {
    ...c,
    evaluate: (e) =>
      e.kind === "number" && e.value === 999998
        ? ({ kind: "omitted" } as unknown as FunctionValue)
        : e.kind === "number" && e.value === 999999
          ? {
              kind: "lambda",
              parameters: ["x"],
              invoke: (args) => c.call("SUM", args),
            }
          : evaluate(e, extended),
  };
  return extended.evaluate(ast);
}
for (const fixture of cases)
  test(fixture.name, () => {
    const c = {
      ...context(
        fixture.cells,
        fixture.formula.startsWith("FORMULATEXT(Results!")
          ? { A1: fixture.formula }
          : {},
        fixture.requiresService,
      ),
      dateSystem: fixture.dateSystem ?? "1900",
    };
    const result = run(fixture.formula, c);
    expect(
      "kind" in result && result.kind === "array" ? result.rows : result,
    ).toEqual(fixture.expected);
  });
test("FORMULATEXT meaningful formula success and length limit", () => {
  expect(
    run("FORMULATEXT(Inputs!A1)", context({}, { A1: "SUM(1,2)" })),
  ).toEqual({ type: "string", value: "=SUM(1,2)" });
  expect(
    run("FORMULATEXT(Inputs!A1)", context({}, { A1: "x".repeat(8193) })),
  ).toEqual(functionError("#N/A"));
});
test("all external capabilities preserve caches when unavailable", () => {
  for (const formula of [
    'RTD("Quotes.Feed","","ABC")',
    'GETPIVOTDATA("Sales",Inputs!A1)',
    'IMAGE("https://example.org/a.png")',
  ])
    expect(() => run(formula, context())).toThrow("unavailable:");
  const c = context();
  const decline = { ...c, services: { invoke: () => undefined } };
  expect(() => run('RTD("Quotes.Feed","","ABC")', decline)).toThrow(
    "unavailable:",
  );
});
test("array allocation and operation budgets abort before output", () => {
  const c = { ...context(), maxArrayCells: 3 };
  expect(() => run("EXPAND(1,1000000,10)", c)).toThrow("unavailable:");
  expect(() => run("EXPAND(1,2,2)", c)).toThrow("unavailable:");
  expect(() =>
    run("SORT(Inputs!A1:A3)", {
      ...context({ A1: n(3), A2: n(2), A3: n(1) }),
      operation: () => {
        throw Error("operation budget");
      },
    }),
  ).toThrow("operation budget");
});
test("empty references become zero while text empties remain data", () => {
  expect(
    run(
      "TOCOL(Inputs!A1:A3,1)",
      context({ A2: { type: "string", value: "" }, A3: n(0) }),
    ),
  ).toEqual({ kind: "array", rows: [[{ type: "string", value: "" }], [n(0)]] });
});
test("negative relative R1C1 and reference input coercion", () => {
  expect(
    run('INDIRECT("Inputs!R[1]C[1]",FALSE)', context({ B2: n(7) })),
  ).toEqual(n(7));
  expect(
    run(
      "ADDRESS(Inputs!A1,Inputs!A2)",
      context({
        A1: { type: "string", value: "2" },
        A2: { type: "boolean", value: true },
      }),
    ),
  ).toEqual({ type: "string", value: "$A$2" });
});
test("nonfinite and enormous reference indices reject", () => {
  expect(run("ADDRESS(1E300,1)", context())).toEqual(functionError());
  expect(run("OFFSET(Inputs!A1,1E300,0)", context())).toEqual(
    functionError("#REF!"),
  );
});
test("GROUPBY default grand total and sorted descending", () => {
  const c = context({
    A1: { type: "string", value: "East" },
    A2: { type: "string", value: "West" },
    B1: n(10),
    B2: n(20),
  });
  expect(
    run("GROUPBY(Inputs!A1:A2,Inputs!B1:B2,LAMBDA(x,SUM(x)),0,1,-2)", c),
  ).toEqual({
    kind: "array",
    rows: [
      [{ type: "string", value: "West" }, n(20)],
      [{ type: "string", value: "East" }, n(10)],
      [{ type: "string", value: "Total" }, n(30)],
    ],
  });
});
test("GROUPBY unsupported hierarchy preserves cache rather than fabricating", () => {
  expect(() =>
    run("GROUPBY(Inputs!A1:B2,Inputs!C1:C2,LAMBDA(x,SUM(x)),0,2)", context()),
  ).toThrow("unavailable:");
});

test("INDIRECT resolves explicitly supplied workbook names", () => {
  const c = context({ B2: n(81) });
  const named = {
    ...c,
    source: {
      ...c.source,
      resolveName: (name: string) =>
        name === "Revenue"
          ? {
              sheet: "Inputs",
              firstRow: 2,
              firstColumn: 2,
              height: 1,
              width: 1,
            }
          : undefined,
    },
  };
  expect(run('INDIRECT("Revenue")', named)).toEqual(n(81));
  expect(run('INDIRECT("MissingName")', named)).toEqual(functionError("#REF!"));
  expect(() => run('INDIRECT("Revenue")', c)).toThrow("unavailable:");
});
test("service error responses propagate, with unchanged topic and origin", () => {
  const c = context();
  const service = {
    ...c,
    services: {
      invoke: (
        name: string,
        args: readonly FunctionValue[],
        address: typeof c.address,
      ) => {
        expect(name).toBe("RTD");
        expect(args).toEqual([
          { type: "string", value: "Quotes.Feed" },
          { type: "string", value: "" },
          { type: "string", value: "ABC" },
        ]);
        expect(address).toEqual(c.address);
        return functionError("#N/A");
      },
    },
  };
  expect(run('RTD("Quotes.Feed",,"ABC")', service)).toEqual(
    functionError("#N/A"),
  );
});
test("IMAGE supports explicit single-axis dimensions without fetching", () => {
  const c = context({}, {}, true);
  expect(run('IMAGE("https://example.org/a.png","Product",3,100)', c)).toEqual({
    type: "string",
    value: "[image: Product]",
  });
  expect(run('IMAGE("https://example.org/a.png","Product",3,,200)', c)).toEqual(
    { type: "string", value: "[image: Product]" },
  );
  expect(run('IMAGE("https://example.org/a.png","Product",3,0)', c)).toEqual(
    functionError(),
  );
});
test("all handlers enforce argument counts", () => {
  const c = context();
  for (const [name, handler] of lookupFunctions) {
    if (name !== "ROW" && name !== "COLUMN")
      expect(handler([], c)).toEqual(functionError());
    const arg: FormulaExpression = {
      kind: "number",
      value: 1,
      lexical: "1",
      start: 0,
      end: 1,
    };
    expect(
      handler(
        Array.from({ length: 256 }, () => arg),
        c,
      ),
    ).toEqual(functionError());
  }
});
