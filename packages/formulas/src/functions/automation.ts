import type { FormulaExpression } from "../ast.ts";
import type { FormulaScalarValue } from "../evaluator.ts";
import {
  functionError, functionNumber, functionNumeric, functionScalar,
  type ExtendedFunction, type FunctionContext, type FunctionRegistry, type FunctionValue,
} from "../function-runtime.ts";

// Units per EUR, with calculation precision from Microsoft's EUROCONVERT table.
// Deliberately limited to the currencies documented for this Excel add-in.
const currencies = new Map<string, readonly [number, number]>([
  ["EUR", [1, 2]], ["ATS", [13.7603, 2]], ["BEF", [40.3399, 0]],
  ["DEM", [1.95583, 2]], ["ESP", [166.386, 0]], ["FIM", [5.94573, 2]],
  ["FRF", [6.55957, 2]], ["IEP", [0.787564, 2]], ["ITL", [1936.27, 0]],
  ["LUF", [40.3399, 0]], ["NLG", [2.20371, 2]], ["PTE", [200.482, 0]],
  ["GRD", [340.750, 0]], ["SIT", [239.640, 2]],
]);

function scalar(argument: FormulaExpression, context: FunctionContext): FormulaScalarValue {
  context.operation();
  return functionScalar(context.evaluate(argument));
}

// Decimal shifting avoids introducing a binary rounding error by multiplying by
// 100. Once the requested precision exceeds double resolution, leave it alone.
// Constant work, including for enormous precision arguments and subnormal values.
function round(value: number, digits: number): number {
  if (!Number.isFinite(value) || value === 0 || digits > 324) return value;
  const [mantissa = "0", exponent = "0"] = Math.abs(value).toExponential().split("e");
  const shifted = Number(`${mantissa}e${Number(exponent) + digits}`);
  if (!Number.isFinite(shifted) || shifted >= 1e16) return value;
  const rounded = Math.floor(shifted + 0.5);
  const [m = "0", e = "0"] = rounded.toExponential().split("e");
  return Math.sign(value) * Number(`${m}e${Number(e) - digits}`);
}

const euroconvert: ExtendedFunction = (arguments_, context) => {
  if (arguments_.length < 3 || arguments_.length > 5) return functionError();
  const values = arguments_.map(argument => scalar(argument, context));
  const error = values.find(value => value.type === "error");
  if (error) return error;
  const amount = functionNumeric(values[0]!);
  if (amount.type !== "number") return amount;
  const from = values[1]!;
  const to = values[2]!;
  if (from.type !== "string" || to.type !== "string") return functionError();
  const source = currencies.get(from.value.toUpperCase());
  const target = currencies.get(to.value.toUpperCase());
  if (!source || !target) return functionError();

  let full = false;
  const flag = values[3];
  if (flag) {
    if (flag.type === "string" && /^(TRUE|FALSE)$/i.test(flag.value)) {
      full = flag.value.toUpperCase() === "TRUE";
    } else {
      const numeric = functionNumeric(flag);
      if (numeric.type !== "number") return numeric;
      full = numeric.value !== 0;
    }
  }
  let precision: number | undefined;
  if (values[4]) {
    const numeric = functionNumeric(values[4]);
    if (numeric.type !== "number") return numeric;
    precision = Math.trunc(numeric.value);
    if (!Number.isFinite(precision) || precision < 3) return functionError();
  }
  if (from.value.toUpperCase() === to.value.toUpperCase()) return functionNumber(amount.value);
  let euros = amount.value / source[0];
  // Excel's worked examples use decimal places for the intermediate euro amount.
  if (source[0] !== 1 && precision !== undefined) euros = round(euros, precision);
  const result = euros * target[0];
  return functionNumber(full ? result : round(result, target[1]));
};

function procedure(value: FormulaScalarValue): boolean {
  return (value.type === "string" && value.value.length > 0)
    || (value.type === "number" && Number.isInteger(value.value) && value.value > 0);
}

function host(name: string, values: readonly FunctionValue[], context: FunctionContext): FunctionValue {
  context.operation();
  const result = context.services?.invoke(name, values, context.address);
  if (result === undefined) return context.unavailable(`${name} requires an explicit automation host adapter`);
  if ("kind" in result) {
    if (result.kind !== "array") return functionError();
    const height = result.rows.length;
    const width = result.rows[0]?.length ?? 0;
    if (!height || !width || height > context.maxArrayCells / width) {
      return context.unavailable(`${name} host result exceeds the array cell budget`);
    }
    for (const row of result.rows) {
      context.operation(row.length);
      if (row.length !== width) return functionError();
      for (const value of row) if (value.type === "number" && !Number.isFinite(value.value)) return functionError("#NUM!");
    }
  } else if (result.type === "number") return functionNumber(result.value);
  return result;
}

const registerId: ExtendedFunction = (arguments_, context) => {
  if (arguments_.length < 2 || arguments_.length > 3) return functionError();
  const values = arguments_.map(argument => scalar(argument, context));
  const error = values.find(value => value.type === "error");
  if (error) return error;
  if (values[0]!.type !== "string" || !values[0]!.value || !procedure(values[1]!)) return functionError();
  if (values[2] && (values[2].type !== "string" || !values[2].value)) return functionError();
  return host("REGISTER.ID", values, context);
};

const call: ExtendedFunction = (arguments_, context) => {
  if (arguments_.length < 1 || arguments_.length > 255) return functionError();
  const first = scalar(arguments_[0]!, context);
  if (first.type === "error") return first;
  let headerLength: number;
  if (first.type === "number") {
    if (!Number.isFinite(first.value) || first.value <= 0 || !Number.isInteger(first.value)) return functionError();
    headerLength = 1;
  } else if (first.type === "string" && first.value && arguments_.length >= 2) {
    headerLength = Math.min(arguments_.length, 3);
  } else return functionError();
  const values: FunctionValue[] = [first];
  for (let index = 1; index < arguments_.length; index++) {
    context.operation();
    const value = context.evaluate(arguments_[index]!);
    if (index < headerLength) {
      const header = functionScalar(value);
      if (header.type === "error") return header;
      if (index === 1 ? !procedure(header) : header.type !== "string" || !header.value) return functionError();
    }
    if ("kind" in value) {
      if (value.kind !== "array") return functionError();
      const width = value.rows[0]?.length ?? 0;
      if (!width || value.rows.length > context.maxArrayCells / width) {
        return context.unavailable("CALL argument exceeds the array cell budget");
      }
      for (const row of value.rows) {
        context.operation(row.length);
        if (row.length !== width) return functionError();
      }
    }
    values.push(value);
  }
  // The host is responsible for allowlisting resources, signature/marshalling,
  // registered ID lifetime, and macro-sheet policy. No DLL or network IO here.
  return host("CALL", values, context);
};

export const automationFunctions: FunctionRegistry = new Map([
  ["CALL", call], ["EUROCONVERT", euroconvert], ["REGISTER.ID", registerId],
]);
