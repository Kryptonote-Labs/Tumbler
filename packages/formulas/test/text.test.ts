import { expect, test } from "bun:test";
import { textFunctions } from "../src/functions/text.ts";
import { parseFormula } from "../src/parser.ts";
import type { FormulaExpression } from "../src/ast.ts";
import type {
  FunctionContext,
  FunctionValue,
} from "../src/function-runtime.ts";
import type { FormulaScalarValue } from "../src/evaluator.ts";
import { cases, type TextCase } from "./fixtures/text.ts";
function context(
  fixture: Partial<TextCase> = {},
  services: FunctionContext["services"] = undefined,
  limit = 100000,
): FunctionContext {
  const c: FunctionContext = {
    evaluateAggregate(expression) { return this.evaluate(expression); },
    address: { sheet: "Results", row: 1, column: 1 },
    source: {
      formulaCells: [],
      cell: () => undefined,
      resolveSheet: (_, s) => s,
    },
    dateSystem: fixture.dateSystem ?? "1900",
    maxArrayCells: 10000,
    services,
    operation: (count = 1) => {
      limit -= count;
      if (limit < 0) throw new Error("operation budget");
    },
    now: () => new Date("2026-01-01"),
    random: () => 0.5,
    unavailable: (message) => {
      throw new Error("unavailable: " + message);
    },
    reference: () => ({ type: "error", value: "#REF!" }),
    readReference: () => ({ type: "error", value: "#REF!" }),
    cell: () => undefined,
    withBindings: () => {
      throw new Error("bindings unused");
    },
    call: (name, v) => {
      const fn = textFunctions.get(name);
      if (!fn) {
        if (name === "SEARCH") {
          const a = v as FormulaScalarValue[];
          const pos = String(a[1]?.type === "string" ? a[1].value : "")
            .toLowerCase()
            .indexOf(
              String(a[0]?.type === "string" ? a[0].value : "").toLowerCase(),
            );
          return pos < 0
            ? { type: "error", value: "#VALUE!" }
            : { type: "number", value: pos + 1 };
        }
        throw new Error("missing " + name);
      }
      return fn(
        v.map((_, i) => ({
          kind: "number",
          value: i,
          lexical: String(i),
          start: 0,
          end: 0,
        })),
        { ...c, evaluate: (a) => v[(a as { value: number }).value]! },
      );
    },
    evaluate: (e: FormulaExpression): FunctionValue => {
      switch (e.kind) {
        case "omitted": return { kind: "omitted" };
        case "array": return {kind: "array", rows: e.rows.map(row => row.map(item => {
          const value = c.evaluate(item);
          return "kind" in value ? {type: "error" as const, value: "#VALUE!" as const} : value;
        }))};
        case "number":
        case "string":
        case "boolean":
        case "error":
          return { type: e.kind, value: e.value } as FormulaScalarValue;
        case "reference":
          return (
            fixture.cells?.["A" + e.startReference.row] ?? { type: "blank" }
          );
        case "unary": {
          const x = c.evaluate(e.operand) as { type: "number"; value: number };
          return {
            type: "number",
            value: e.operator === "-" ? -x.value : x.value,
          };
        }
        case "function": {
          const fn = textFunctions.get(e.name);
          if (!fn) throw new Error("missing " + e.name);
          return fn(e.arguments, c);
        }
        default:
          throw new Error("unsupported test AST " + e.kind);
      }
    },
  };
  return c;
}
for (const fixture of cases)
  test(fixture.name, () => {
    const service: FunctionContext["services"] = fixture.requiresService
      ? {
          invoke: (name, args, address) => {
            expect(address.sheet).toBe("Results");
            expect(args.length).toBeGreaterThan(0);
            const responses: Record<string, FunctionValue> = {
              TRANSLATE: { type: "string", value: "Bonjour" },
              DETECTLANGUAGE: { type: "string", value: "fr" },
              PHONETIC: { type: "string", value: "とうきょう" },
            };
            return responses[name];
          },
        }
      : undefined;
    const result = context(fixture, service).evaluate(
      parseFormula(fixture.formula).expression,
    );
    expect(
      "kind" in result && result.kind === "array" ? result.rows : result,
    ).toEqual(fixture.expected);
  });
for (const name of textFunctions.keys())
  test(name + " argument count", () =>
    expect(textFunctions.get(name)!([], context())).toEqual({
      type: "error",
      value: "#VALUE!",
    }),
  );
for (const formula of [
  'TRANSLATE("hello")',
  'DETECTLANGUAGE("hello")',
  'PHONETIC("東京")',
  'REGEXTEST("abc","(?<=a)b")',
])
  test("absent host " + formula, () =>
    expect(() => context().evaluate(parseFormula(formula).expression)).toThrow(
      "unavailable",
    ),
  );
test("bounded hostile regex", () =>
  expect(() =>
    context({}, undefined, 500).evaluate(
      parseFormula('REGEXTEST("aaaaaaaaaaaaaaaaab","(a+)+$")').expression,
    ),
  ).toThrow("operation budget"));
test("REPT near limit", () =>
  expect(
    context().evaluate(parseFormula('REPT("a",32767)').expression),
  ).toEqual({ type: "string", value: "a".repeat(32767) }));
test("array serialization", () =>
  expect(
    context().call("ARRAYTOTEXT", [
      {
        kind: "array",
        rows: [
          [
            { type: "string", value: "a" },
            { type: "number", value: 2 },
          ],
          [
            { type: "boolean", value: true },
            { type: "error", value: "#N/A" },
          ],
        ],
      },
      { type: "number", value: 1 },
    ]),
  ).toEqual({ type: "string", value: '{"a",2;TRUE,#N/A}' }));

test("scalar functions broadcast with per-cell errors", () =>
  expect(
    context().call("REPT", [
      {
        kind: "array",
        rows: [
          [{ type: "string", value: "x" }],
          [{ type: "error", value: "#N/A" }],
        ],
      },
      { type: "number", value: 2 },
    ]),
  ).toEqual({
    kind: "array",
    rows: [
      [{ type: "string", value: "xx" }],
      [{ type: "error", value: "#N/A" }],
    ],
  }));
test("spill allocations respect maxArrayCells", () => {
  const c = context();
  expect({ ...c, maxArrayCells: 1 }.call).toBeDefined();
  const fn = textFunctions.get("TEXTSPLIT")!;
  expect(
    fn(
      parseFormula('TEXTSPLIT("a,b",",")').expression.kind === "function"
        ? (
            parseFormula('TEXTSPLIT("a,b",",")').expression as Extract<
              FormulaExpression,
              { kind: "function" }
            >
          ).arguments
        : [],
      { ...c, maxArrayCells: 1 },
    ),
  ).toEqual({ type: "error", value: "#NUM!" });
});

test("TEXTSPLIT charges every candidate delimiter comparison", () => {
  const c = context({}, undefined, 50000);
  const evaluate = c.evaluate;
  c.evaluate = expression => expression.kind === "function" && expression.name === "DELIMS"
    ? {kind: "array", rows: [Array.from({length: 10000}, () => ({type: "string" as const, value: "b"}))]}
    : evaluate(expression);
  expect(() => c.evaluate(parseFormula(`TEXTSPLIT("${"a".repeat(10000)}",DELIMS())`).expression)).toThrow("operation budget");
});
