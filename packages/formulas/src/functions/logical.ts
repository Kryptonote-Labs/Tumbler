import type { FormulaExpression } from "../ast.ts";
import type { FormulaScalarValue } from "../evaluator.ts";
import {
  functionError as error, functionNumber as number, functionNumeric,
  type FunctionContext, type FunctionLambda, type FunctionRegistry, type FunctionValue,
} from "../function-runtime.ts";

// The shared evaluator owns name resolution, lexical scopes and invocation.
function bindingName(expression: FormulaExpression, lambda: boolean): string | undefined {
  const node = expression as { kind: string; name?: string };
  if (node.kind !== "name" || typeof node.name !== "string") return undefined;
  const name = node.name.replace(/^_xlpm\./i, "");
  if (name.length > 255 || !/^[\p{L}_\\][\p{L}\p{N}_\\.]*$/u.test(name) || (lambda && name.includes("."))) return undefined;
  if ((!lambda && /^[rc]$/i.test(name)) || /^r\d+c\d+$/i.test(name)) return undefined;
  const cell = /^([a-z]+)([1-9]\d*)$/i.exec(name);
  if (cell) {
    let column = 0;
    for (const letter of cell[1]!.toUpperCase()) column = column * 26 + letter.charCodeAt(0) - 64;
    if (column <= 16384 && Number(cell[2]) <= 1048576) return undefined;
  }
  return name.toUpperCase();
}
function isLambda(value: FunctionValue): value is FunctionLambda {
  return "kind" in value && value.kind === "lambda";
}
function isError(value: FunctionValue): value is FormulaScalarValue & { type: "error" } {
  return !("kind" in value) && value.type === "error";
}
function scalarResult(value: FunctionValue): FormulaScalarValue {
  if ((value as { kind?: string }).kind === "omitted") return number(0);
  if (!("kind" in value)) return value.type === "blank" ? number(0) : value;
  if (value.kind === "array" && value.rows.length === 1 && value.rows[0]?.length === 1) return scalarResult(value.rows[0][0]!);
  return error("#CALC!");
}
function matrix(value: FunctionValue, context: FunctionContext): readonly (readonly FormulaScalarValue[])[] | FormulaScalarValue {
  if ((value as { kind?: string }).kind === "omitted") return [[{ type: "blank" }]];
  if ("kind" in value && value.kind !== "array") return error("#CALC!");
  const rows = "kind" in value ? value.rows : [[value]];
  const width = rows[0]?.length ?? 0;
  if (!rows.length || !width) return error("#CALC!");
  if (rows.length > context.maxArrayCells / width) return error("#NUM!");
  context.operation(rows.length);
  if (rows.some(row => row.length !== width)) return error("#VALUE!");
  return rows;
}
function build(height: number, width: number, context: FunctionContext, cell: (row: number, column: number) => FunctionValue): FunctionValue {
  if (height > context.maxArrayCells / width) return error("#NUM!");
  const rows: FormulaScalarValue[][] = [];
  for (let row = 0; row < height; row++) {
    const output: FormulaScalarValue[] = [];
    for (let column = 0; column < width; column++) {
      context.operation();
      const value = cell(row, column);
      if ("kind" in value && (value as { kind: string }).kind !== "omitted" && (value.kind !== "array" || value.rows.length !== 1 || value.rows[0]?.length !== 1)) return error("#CALC!");
      output.push(scalarResult(value));
    }
    rows.push(output);
  }
  return { kind: "array", rows };
}
const lambda: NonNullable<ReturnType<FunctionRegistry["get"]>> = (args, context) => {
  if (args.length < 1 || args.length > 254) return error();
  const parameters: string[] = [];
  for (const argument of args.slice(0, -1)) {
    context.operation();
    const name = bindingName(argument, true);
    if (!name || parameters.includes(name)) return error();
    parameters.push(name);
  }
  return {
    kind: "lambda", parameters,
    invoke(values) {
      context.operation();
      if (values.length !== parameters.length) return error();
      return context.withBindings(new Map(parameters.map((name, index) => [name, values[index]!])), args[args.length - 1]!, true);
    },
  };
};
const letFunction: NonNullable<ReturnType<FunctionRegistry["get"]>> = (args, context) => {
  if (args.length < 3 || args.length > 253 || args.length % 2 !== 1) return error();
  const bindings = new Map<string, FunctionValue>();
  for (let index = 0; index < args.length - 1; index += 2) {
    context.operation();
    const name = bindingName(args[index]!, false);
    if (!name || bindings.has(name)) return error();
    // Snapshot the bindings: a closure created by this value must retain this scope.
    const value = context.withBindings(new Map(bindings), args[index + 1]!, true);
    bindings.set(name, value);
  }
  return context.withBindings(bindings, args[args.length - 1]!, true);
};
function byAxis(byRow: boolean): NonNullable<ReturnType<FunctionRegistry["get"]>> {
  return (args, context) => {
    if (args.length !== 2) return error();
    const input = matrix(context.evaluate(args[0]!), context);
    if (!Array.isArray(input)) return input as FormulaScalarValue;
    const fn = context.evaluate(args[1]!);
    if (isError(fn)) return fn;
    if (!isLambda(fn) || fn.parameters.length !== 1) return error();
    const height = input.length, width = input[0]!.length;
    return build(byRow ? height : 1, byRow ? 1 : width, context, (row, column) => {
      // Copying a column also consumes the operation budget.
      context.operation(byRow ? width : height);
      const rows = byRow ? [input[row]!] : input.map(values => [values[column]!]);
      return fn.invoke([{ kind: "array", rows }]);
    });
  };
}
const makeArray: NonNullable<ReturnType<FunctionRegistry["get"]>> = (args, context) => {
  if (args.length !== 3) return error();
  const dimensions: number[] = [];
  for (const arg of args.slice(0, 2)) {
    const evaluated = context.evaluate(arg);
    const value = "kind" in evaluated && evaluated.kind === "array" && evaluated.rows.length === 1 && evaluated.rows[0]?.length === 1 ? evaluated.rows[0][0]! : evaluated;
    if (isError(value)) return value;
    if ("kind" in value) return error();
    const numeric = functionNumeric(value);
    if (numeric.type !== "number" || numeric.value < 1 || !Number.isInteger(numeric.value)) return error();
    dimensions.push(Math.trunc(numeric.value));
  }
  const [height, width] = dimensions as [number, number];
  if (height > 1048576 || width > 16384) return error("#NUM!");
  const fn = context.evaluate(args[2]!);
  if (isError(fn)) return fn;
  if (!isLambda(fn) || fn.parameters.length !== 2) return error();
  return build(height, width, context, (row, column) => fn.invoke([number(row + 1), number(column + 1)]));
};
const map: NonNullable<ReturnType<FunctionRegistry["get"]>> = (args, context) => {
  if (args.length < 2 || args.length > 254) return error();
  const inputs: (readonly (readonly FormulaScalarValue[])[])[] = [];
  let height = 0, width = 0;
  for (const arg of args.slice(0, -1)) {
    context.operation();
    const value = context.evaluateAggregate(arg);
    if (args.length > 2 && (!("kind" in value) || value.kind !== "array")) return isError(value) ? value : error();
    const input = matrix(value, context);
    if (!Array.isArray(input)) return input as FormulaScalarValue;
    inputs.push(input);
    height = Math.max(height, input.length);
    width = Math.max(width, input[0]!.length);
  }
  const fn = context.evaluate(args[args.length - 1]!);
  if (isError(fn)) return fn;
  if (!isLambda(fn) || fn.parameters.length !== inputs.length) return error();
  return build(height, width, context, (row, column) => {
    context.operation(inputs.length);
    return fn.invoke(inputs.map(input => input[row]?.[column] ?? error("#N/A")));
  });
};
function fold(scan: boolean): NonNullable<ReturnType<FunctionRegistry["get"]>> {
  return (args, context) => {
    if (args.length !== 3) return error();
    const initial = context.evaluate(args[0]!);
    const omitted = "kind" in initial && initial.kind === "omitted";
    let accumulator: FunctionValue = omitted ? number(0) : initial;
    const input = matrix(context.evaluate(args[1]!), context);
    if (!Array.isArray(input)) return input as FormulaScalarValue;
    const fn = context.evaluate(args[2]!);
    if (isError(fn)) return fn;
    if (!isLambda(fn) || fn.parameters.length !== 2) return error();
    let first = true;
    const step = (value: FormulaScalarValue) => {
      context.operation();
      if (!scan && omitted && first) accumulator = value;
      else accumulator = fn.invoke([accumulator, value]);
      first = false;
      return accumulator;
    };
    if (scan) return build(input.length, input[0]!.length, context, (row, column) => {
      return step(input[row]![column]!);
    });
    for (const row of input) for (const value of row) step(value);
    return accumulator;
  };
}
export const logicalFunctions: FunctionRegistry = new Map([
  ["TRUE", args => args.length ? error() : { type: "boolean", value: true }],
  ["FALSE", args => args.length ? error() : { type: "boolean", value: false }],
  ["LAMBDA", lambda], ["LET", letFunction], ["BYCOL", byAxis(false)], ["BYROW", byAxis(true)],
  ["MAKEARRAY", makeArray], ["MAP", map], ["REDUCE", fold(false)], ["SCAN", fold(true)],
]);
