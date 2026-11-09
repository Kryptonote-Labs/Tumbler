import { expect, test } from "bun:test";
import {
  calculateFormulas,
  type FormulaScalarValue,
  type FormulaWorkbookSource,
} from "../src/index.ts";
const at = { sheet: "S", row: 1, column: 1 };
function run(formula: string, options = {}) {
  const source: FormulaWorkbookSource = {
    formulaCells: [{ address: at, formula }],
    cell: (address) =>
      address.row === 1 && address.column === 1
        ? { formula, value: { type: "blank" } }
        : undefined,
    resolveSheet: () => "S",
  };
  return calculateFormulas(source, options);
}
const n = (value: number): FormulaScalarValue => ({ type: "number", value });

test.each([
  ['AVEDEV(1,TRUE,"3")', 8 / 9],
  ['AVEDEV({1,TRUE,"3"})', 0],
  ['AVERAGEA({1,TRUE,"3"})', 2 / 3],
  ["MAXA({-1,FALSE})", 0],
  ["MINA({2,TRUE})", 1],
  ['AVERAGE(1,TRUE,"3")', 5 / 3],
  ['COUNT({1,"2",TRUE},"3",TRUE)', 3],
  ["STDEV.S(1000000000001,1000000000002,1000000000003)", 1],
  ["PERCENTILE.EXC({1,2,3,4,5},0.5)", 3],
  ["PERCENTRANK.EXC({1,2,3,4,5},3)", 0.5],
  ["RANK.AVG(2,{1,2,2,4},1)", 2.5],
  ["TRIMMEAN({1,2,3,4,100},0.4)", 3],
  ["BETA.DIST(0,1,3,FALSE)", 3],
  ["BETA.DIST(1,3,1,FALSE)", 3],
  ["BETA.INV(0,2,3)", 0],
  ["BETA.INV(1,2,3)", 1],
  ["BINOM.INV(10,0,0.5)", 0],
  ["GAMMA.DIST(0,1,2,FALSE)", 0.5],
  ["CHISQ.DIST(0,2,FALSE)", 0.5],
  ["F.DIST(0,2,4,FALSE)", 1],
  ["NORM.S.DIST(0,TRUE)", 0.5],
  ["T.DIST(0,7,TRUE)", 0.5],
  ["GAMMA(-0.5)", -2 * Math.sqrt(Math.PI)],
  ["NORM.S.DIST(-8,TRUE)", 6.22096057427174e-16],
  ["CHISQ.DIST.RT(100,2)", Math.exp(-50)],
  ["BINOM.DIST.RANGE(100,0.5,100)", 2 ** -100],
  ["PHI(0)", 1 / Math.sqrt(2 * Math.PI)],
])("statistical semantics: %s", (formula, expected) => {
  const actual = run(formula);
  expect(actual.diagnostics).toEqual([]);
  const value = actual.value(at);
  expect(value?.type).toBe("number");
  if (value?.type === "number")
    expect(Math.abs(value.value - expected)).toBeLessThanOrEqual(
      Math.max(Number.MIN_VALUE, Math.abs(expected) * 1e-11),
    );
});
test.each([
  ['AVERAGE("bad")', "#VALUE!"],
  ['MIN("bad")', "#VALUE!"],
  ['AVEDEV("bad")', "#VALUE!"],
  ["STDEV.S(1)", "#DIV/0!"],
  ["KURT(1,2,3)", "#DIV/0!"],
  ["SKEW(1,1,1)", "#DIV/0!"],
  ["PERCENTILE.EXC({1,2,3},0.1)", "#NUM!"],
  ["RANK.AVG(9,{1,2})", "#N/A"],
  ["MODE.MULT(1,2,3)", "#N/A"],
  ["BETA.DIST(0.5,0,1,TRUE)", "#NUM!"],
  ["NORM.INV(1,0,1)", "#NUM!"],
  ["CONFIDENCE.T(0.05,1,1)", "#DIV/0!"],
  ["GAMMA(0)", "#NUM!"],
  ["CHISQ.TEST({1,2},{1;2})", "#N/A"],
  ["CORREL({1,2},{1})", "#N/A"],
  ["SLOPE({1,2},{1,1})", "#DIV/0!"],
  ["LOGEST({1,0,3})", "#NUM!"],
  ["LINEST({1,2;3,4})", "#REF!"],
  ['MAXIFS({1,2},{1,2},">0")', "#VALUE!"],
  ["FORECAST.ETS(4,{1,2,3},{1,2,3},9000)", "#NUM!"],
])("statistical errors: %s", (formula, expected) => {
  const value = run(formula).value(at);
  expect(value?.type).toBe("error");
  expect(value?.type === "error" && value.value === expected).toBe(true);
});
test("inverse distribution tails retain relative accuracy", () => {
  for (const p of [1e-12, 1e-8, 0.01, 0.5, 0.99]) {
    const result = run(`NORM.S.DIST(NORM.S.INV(${p}),TRUE)`).value(at);
    expect(result?.type).toBe("number");
    if (result?.type === "number")
      expect(Math.abs(result.value - p) / p).toBeLessThan(1e-10);
  }
});
test("scalar distributions broadcast and isolate per-cell errors", () => {
  const result = run("NORM.S.INV({0.5,0,0.5;0.5,0.5,0.5})");
  expect(result.arrayValue(at)?.rows).toEqual([
    [n(0), { type: "error", value: "#NUM!" }, n(0)],
    [n(0), n(0), n(0)],
  ]);
});
test("multiple regression removes dependent columns and preserves coefficient order", () => {
  const result = run("LINEST({3;5;7;9},{1,2;2,4;3,6;4,8})");
  const rows = result.arrayValue(at)?.rows;
  expect(rows?.[0]?.length).toBe(3);
  expect(rows?.[0]?.[1]).toEqual(n(0));
  expect(rows?.[0]?.[0]?.type === "number" && rows[0][0].value).toBeCloseTo(
    1,
    12,
  );
  expect(rows?.[0]?.[2]?.type === "number" && rows[0][2].value).toBeCloseTo(
    1,
    12,
  );
});
test("statistics obey the evaluator operation budget", () => {
  const result = run("BINOM.DIST.RANGE(1000000000,0.5,0,1000000000)", {
    maxOperations: 100,
  });
  expect(result.diagnostics.map((d) => d.code)).toContain("evaluation-limit");
});

test.each([
  ["MODE.SNGL(1,TRUE)", 1],
  ['MODE.MULT(1,"1")', 1],
  ["FORECAST.ETS(9,{8;12;8;12;8;12;8;12},{1;2;3;4;5;6;7;8},2)", 8],
  ["FORECAST.ETS.SEASONALITY({8;12;8;12;8;12;8;12},{1;2;3;4;5;6;7;8})", 2],
  ["FORECAST.ETS(7,{2;4;8;10;12},{1;2;4;5;6},0)", 14],
  ["FORECAST.ETS.STAT({2;4;6;8},{1;2;3;4},7,0)", 0],
])("additional range and forecasting semantics: %s", (formula, expected) => {
  const value = run(formula).value(at);
  expect(value?.type).toBe("number");
  if (value?.type === "number") expect(value.value).toBeCloseTo(expected, 10);
});
test("duplicate frequency bins do not count observations twice", () => {
  expect(run("FREQUENCY({1;2;3},{2;2})").arrayValue(at)?.rows).toEqual([
    [n(2)],
    [n(0)],
    [n(1)],
  ]);
});
test("regression rejects excessive work before allocating a quadratic workspace", () => {
  const predictors = [0, 1]
    .map((offset) =>
      Array.from({ length: 100 }, (_, i) => i + offset).join(","),
    )
    .join(";");
  const result = run(`LINEST({1;2},{${predictors}})`, { maxOperations: 1000 });
  expect(result.diagnostics.map((d) => d.code)).toContain("evaluation-limit");
});
