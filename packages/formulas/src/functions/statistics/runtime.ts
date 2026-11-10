import type { FormulaExpression } from "../../ast.ts";
import type { FormulaScalarValue } from "../../evaluator.ts";
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
} from "../../function-runtime.ts";

export class ExcelError {
  constructor(readonly value: FormulaScalarValue) {}
}
export const fail = (code: `#${string}` = "#NUM!"): never => {
  throw new ExcelError(functionError(code));
};
export const check: (
  condition: unknown,
  code?: `#${string}`,
) => asserts condition = (condition, code = "#NUM!") => {
  if (!condition) fail(code);
};
export function isOmitted(v: FunctionValue): boolean {
  return "kind" in v && (v.kind as string) === "omitted";
}
export function numeric(v: FunctionValue): number {
  if (isOmitted(v)) return 0;
  const rows = functionMatrix(v);
  const scalar =
    "kind" in v &&
    v.kind === "array" &&
    rows.length === 1 &&
    rows[0]!.length === 1
      ? rows[0]![0]!
      : functionScalar(v);
  const n = functionNumeric(scalar);
  if (n.type === "error") throw new ExcelError(n);
  return n.type === "number" ? n.value : fail("#VALUE!");
}
export function values(
  v: FunctionValue,
  c: FunctionContext,
): FormulaScalarValue[] {
  if (isOmitted(v)) return [];
  const rows = functionMatrix(v);
  let size = 0;
  for (const row of rows) {
    size += row.length;
    check(size <= c.maxArrayCells, "#NUM!");
  }
  c.operation(size);
  return rows.flat();
}
export function data(
  v: FunctionValue,
  c: FunctionContext,
  literal = false,
): number[] {
  const out: number[] = [];
  for (const x of values(v, c)) {
    if (x.type === "error") throw new ExcelError(x);
    if (x.type === "number") out.push(x.value);
    else if (literal && x.type !== "blank") out.push(numeric(x));
  }
  return out;
}
export function moments(xs: number[], sample: boolean): [number, number] {
  check(xs.length > (sample ? 1 : 0), "#DIV/0!");
  let mean = 0,
    m2 = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = xs[i]! - mean;
    mean += d / (i + 1);
    m2 += d * (xs[i]! - mean);
  }
  return [mean, m2 / (xs.length - (sample ? 1 : 0))];
}
export const registry = new Map<string, ExtendedFunction>();
export function register(
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
      const evaluated = args.map((x) =>
        aggregate ? c.evaluateAggregate(x) : c.evaluate(x),
      );
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
export function scalar(
  name: string,
  min: number,
  max: number,
  fn: (v: (number | undefined)[], c: FunctionContext) => number,
) {
  register(
    name,
    min,
    max,
    (v, c) => {
      const calculate = (args: FunctionValue[]) =>
        fn(
          args.map((x) => (isOmitted(x) ? undefined : numeric(x))),
          c,
        );
      if (!v.some((x) => "kind" in x && x.kind === "array"))
        return calculate(v);
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
    },
    false,
  );
}
