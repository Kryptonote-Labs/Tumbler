import type { FormulaExpression } from "../ast.ts";
import {
  functionError,
  type FunctionContext,
  type FunctionRegistry,
  type FunctionValue,
} from "../function-runtime.ts";

/** Host results remain ordinary runtime values; rich objects belong to the host. */
function invoke(name: string, values: readonly FunctionValue[], context: FunctionContext): FunctionValue {
  context.operation();
  const result = context.services?.invoke(name, values, context.address);
  if (result === undefined) return context.unavailable(`${name} requires an explicit host service`);
  if (!("kind" in result)) {
    return result.type === "number" && !Number.isFinite(result.value) ? functionError("#NUM!") : result;
  }
  if (result.kind !== "array") return context.unavailable(`${name} returned an unsupported rich object`);
  const height = result.rows.length;
  const width = result.rows[0]?.length ?? 0;
  if (height === 0 || width === 0) return functionError("#CALC!");
  if (height > context.maxArrayCells / width) return context.unavailable(`${name} result exceeds maxArrayCells`);
  for (const row of result.rows) {
    context.operation();
    if (row.length !== width) return functionError("#CALC!");
    for (const value of row) {
      context.operation();
      if (value.type === "number" && !Number.isFinite(value.value)) return functionError("#NUM!");
    }
  }
  return result;
}

function fieldvalue(arguments_: readonly FormulaExpression[], context: FunctionContext): FunctionValue {
  if (arguments_.length !== 2) return functionError();
  const values: FunctionValue[] = [];
  for (const argument of arguments_) {
    context.operation();
    const value = context.evaluate(argument);
    if (!("kind" in value) && value.type === "error") return value;
    // Required arguments cannot be omitted; arrays are the only supported
    // nonscalar inputs. This also rejects lambdas before crossing the host API.
    if ("kind" in value && value.kind !== "array") return functionError();
    values.push(value);
  }
  // Do not stringify linked records or collapse array fields. The host resolves
  // metadata, field matching, and broadcasting using its rich data model.
  return invoke("FIELDVALUE", values, context);
}

function py(arguments_: readonly FormulaExpression[], context: FunctionContext): FunctionValue {
  if (arguments_.length !== 2) return functionError();
  const code = arguments_[0]!;
  const mode = arguments_[1]!;
  context.operation();
  // Static means literal, not a reference or a computed string/number. Neither
  // argument is evaluated, so rejected code cannot invoke other functions.
  if (mode.kind !== "number" || (mode.value !== 0 && mode.value !== 1)) return functionError();
  if (code.kind === "number" && Number.isInteger(code.value) && code.value >= 0) {
    return context.unavailable("PY requires the importer to resolve its OOXML Python script index");
  }
  if (code.kind !== "string") return functionError();
  return invoke("PY", [{ type: "string", value: code.value }, { type: "number", value: mode.value }], context);
}

export const specializedFunctions: FunctionRegistry = new Map([
  ["FIELDVALUE", fieldvalue],
  ["PY", py],
]);
