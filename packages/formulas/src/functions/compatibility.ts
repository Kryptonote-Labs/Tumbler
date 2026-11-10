import type { FormulaExpression } from "../ast.ts";
import type { FormulaScalarValue } from "../evaluator.ts";
import {
  functionError,
  functionNumber,
  functionNumeric,
  functionScalar,
  functionMatrix,
  type FunctionContext,
  type FunctionRegistry,
  type FunctionValue,
  type ExtendedFunction,
} from "../function-runtime.ts";

import { statisticalFunctions } from "./statistical.ts";

// All numeric iterations are finite and charged to the caller's operation budget.
class ExcelError {
  constructor(readonly value: FormulaScalarValue) {}
}
const fail = (code: `#${string}` = "#NUM!"): never => {
  throw new ExcelError(functionError(code));
};
const check = (condition: boolean, code: `#${string}` = "#NUM!") => {
  if (!condition) fail(code);
};
function isOmitted(v: FunctionValue): boolean {
  return "kind" in v && (v.kind as string) === "omitted";
}
function numeric(v: FunctionValue): number {
  if (isOmitted(v)) return 0;
  const rows = functionMatrix(v);
  const value = "kind" in v && v.kind === "array" && rows.length === 1 && rows[0]?.length === 1 ? rows[0][0]! : functionScalar(v);
  const n = functionNumeric(value);
  if (n.type === "error") throw new ExcelError(n);
  return n.type === "number" ? n.value : fail("#VALUE!");
}
const registry = new Map<string, ExtendedFunction>();
function register(
  name: string,
  min: number,
  max: number,
  fn: (
    v: FunctionValue[],
    c: FunctionContext,
    args: readonly FormulaExpression[],
  ) => number | FunctionValue,
  aggregate = true,
): void {
  registry.set(name, (args, c) => {
    try {
      check(args.length >= min && args.length <= max, "#VALUE!");
      c.operation(args.length);
      const evaluated = args.map((x) => aggregate ? c.evaluateAggregate(x) : c.evaluate(x));
      for (const value of evaluated)
        if (!("kind" in value) && value.type === "error")
          throw new ExcelError(value);
      const result = fn(evaluated, c, args);
      return typeof result === "number" ? functionNumber(result) : result;
    } catch (e) {
      if (e instanceof ExcelError) return e.value;
      throw e;
    }
  });
}
function scalar(
  name: string,
  min: number,
  max: number,
  fn: (v: (number | undefined)[], c: FunctionContext) => number,
) {
  register(name, min, max, (v, c) => {
    const calculate = (args: FunctionValue[]) =>
      fn(
        args.map((x) => (isOmitted(x) ? undefined : numeric(x))),
        c,
      );
    if (!v.some((x) => "kind" in x && x.kind === "array")) return calculate(v);
    const matrices = v.map((x) =>
      "kind" in x && x.kind === "array" ? x.rows : undefined,
    );
    const height = Math.max(1, ...matrices.map((x) => x?.length ?? 1));
    const width = Math.max(1, ...matrices.map((x) => x?.[0]?.length ?? 1));
    check(height * width <= c.maxArrayCells);
    c.operation(height * width * v.length);
    const rows: FormulaScalarValue[][] = [];
    for (let row = 0; row < height; row++) {
      const output: FormulaScalarValue[] = [];
      for (let col = 0; col < width; col++) {
        try {
          const args = v.map((value, i) => {
            const matrix = matrices[i];
            if (!matrix) return value;
            const r = matrix[matrix.length === 1 ? 0 : row];
            return r?.[r.length === 1 ? 0 : col] ?? functionError("#N/A");
          });
          output.push(functionNumber(calculate(args)));
        } catch (e) {
          if (!(e instanceof ExcelError)) throw e;
          output.push(e.value);
        }
      }
      rows.push(output);
    }
    return { kind: "array", rows };
  }, false);
}
for (const name of ["CEILING", "FLOOR"])
  scalar(name, 2, 2, ([x = 0, s = 0]) => {
    if (s === 0) return name === "CEILING" ? 0 : fail("#DIV/0!");
    check(!(x > 0 && s < 0));
    const q = x / Math.abs(s),
      nearest = Math.round(q);
    const rounded =
      Math.abs(q - nearest) <= Math.abs(q) * 2e-15
        ? nearest
        : name === "CEILING"
          ? s < 0
            ? Math.floor(q)
            : Math.ceil(q)
          : s < 0
            ? Math.ceil(q)
            : Math.floor(q);
    return rounded === 0 ? 0 : rounded * Math.abs(s);
  });

// Keep legacy endpoint/coercion policies separate from modern MODE.SNGL and
// WEIBULL.DIST aliases, which use the canonical statistical registry.
register("MODE", 1, 255, (values, context) => {
  const counts = new Map<number, number>();
  let size = 0, bestCount = 1, result = Infinity;
  for (const value of values) for (const row of functionMatrix(value)) for (const cell of row) {
    context.operation();
    check(++size <= context.maxArrayCells);
    if (cell.type === "error") throw new ExcelError(cell);
    if (cell.type !== "number") continue;
    const count = (counts.get(cell.value) ?? 0) + 1;
    counts.set(cell.value, count);
  }
  for (const [value, count] of counts) {
    context.operation();
    if (count > bestCount) {
      bestCount = count;
      result = value;
    }
  }
  check(bestCount > 1, "#N/A");
  return result;
});
scalar("WEIBULL", 4, 4, ([x = 0, a = 0, b = 0, cumulative = 0]) => {
  check(x >= 0 && a > 0 && b > 0);
  const logRatio = Math.log(x) - Math.log(b), power = Math.exp(a * logRatio);
  if (cumulative) return -Math.expm1(-power);
  if (x === 0) return 0;
  return Math.exp(Math.log(a) - Math.log(b) + (a - 1) * logRatio - power);
});

// Reuse canonical kernels, reference coercion and convergence for the other
// legacy statistics, so this category cannot shadow their numerical fixes.
for (const name of [
  "BETADIST",
  "BETAINV",
  "BINOMDIST",
  "CRITBINOM",
  "CHIDIST",
  "CHIINV",
  "CONFIDENCE",
  "EXPONDIST",
  "FDIST",
  "FINV",
  "GAMMADIST",
  "GAMMAINV",
  "HYPGEOMDIST",
  "LOGINV",
  "LOGNORMDIST",
  "NEGBINOMDIST",
  "NORMDIST",
  "NORMINV",
  "NORMSDIST",
  "NORMSINV",
  "POISSON",
  "TDIST",
  "TINV",
  "STDEV",
  "STDEVP",
  "VAR",
  "VARP",
  "PERCENTILE",
  "QUARTILE",
  "PERCENTRANK",
  "RANK",
  "COVAR",
  "ZTEST",
  "FTEST",
  "TTEST",
  "CHITEST",
]) {
  const handler = statisticalFunctions.get(name);
  if (!handler) throw new Error(`Missing legacy statistical function ${name}`);
  registry.set(name, handler);
}
export const compatibilityFunctions: FunctionRegistry = registry;
