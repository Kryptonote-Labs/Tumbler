import type { FormulaExpression } from "../ast.ts";
import type { FormulaScalarValue } from "../evaluator.ts";
import {
  functionError, functionMatrix, functionNumber, functionScalar, functionText,
  type FunctionContext, type FunctionReference, type FunctionRegistry,
} from "../function-runtime.ts";

type Scalar = FormulaScalarValue;
type Matrix = readonly (readonly Scalar[])[];
type Predicate = (value: Scalar) => boolean;
const blank: Scalar = { type: "blank" };
const names = ["DAVERAGE", "DCOUNT", "DCOUNTA", "DGET", "DMAX", "DMIN", "DPRODUCT", "DSTDEV", "DSTDEVP", "DSUM", "DVAR", "DVARP"] as const;

function range(expression: FormulaExpression, context: FunctionContext): { rows: Matrix; reference: FunctionReference } | Scalar {
  const reference = context.reference(expression);
  if (!("sheet" in reference)) return reference.type === "error" ? reference : functionError();
  const size = reference.height * reference.width;
  if (!Number.isSafeInteger(size) || size > context.maxArrayCells) return functionError("#NUM!");
  context.operation(size);
  const value = context.readReference(reference);
  if (!("kind" in value) && value.type === "error") return value;
  const rows = functionMatrix(value);
  if (rows.length < 2 || rows.length !== reference.height || rows.some(row => row.length !== reference.width)) return functionError();
  return { rows, reference };
}

// Greedy glob matching avoids regular-expression backtracking; every retry is budgeted.
function glob(pattern: string, text: string, context: FunctionContext): boolean {
  const tokens: { value: string; kind: "literal" | "star" | "any" }[] = [];
  for (let i = 0; i < pattern.length; i++) {
    context.operation();
    const char = pattern[i]!;
    if (char === "~" && /[~*?]/.test(pattern[i + 1] ?? "")) tokens.push({ value: pattern[++i]!, kind: "literal" });
    else tokens.push({ value: char, kind: char === "*" ? "star" : char === "?" ? "any" : "literal" });
  }
  let p = 0, t = 0, star = -1, retry = 0;
  while (t < text.length) {
    context.operation();
    const token = tokens[p];
    if (token && (token.kind === "any" || token.kind === "literal" && token.value === text[t])) { p++; t++; }
    else if (token?.kind === "star") { star = p++; retry = t; }
    else if (star >= 0) { p = star + 1; t = ++retry; }
    else return false;
  }
  while (tokens[p]?.kind === "star") { context.operation(); p++; }
  return p === tokens.length;
}

function compare(order: number, operator: string): boolean {
  switch (operator) {
    case "=": return order === 0;
    case "<>": return order !== 0;
    case ">": return order > 0;
    case ">=": return order >= 0;
    case "<": return order < 0;
    case "<=": return order <= 0;
    default: return false;
  }
}

function criterion(value: Scalar, context: FunctionContext): Predicate {
  if (value.type === "blank" || value.type === "string" && value.value === "") return () => true;
  if (value.type === "error") return cell => cell.type === "error" && cell.value === value.value;
  if (value.type === "boolean") return cell => cell.type === "boolean" && cell.value === value.value;
  const text = functionText(value);
  context.operation(text.length);
  const match = /^(<=|>=|<>|=|<|>)/.exec(text);
  const operator = match?.[0] ?? "=";
  const operand = match ? text.slice(operator.length) : text;
  const numeric = value.type === "number" || /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(operand.trim());
  if (numeric) {
    const number = Number(operand);
    return cell => {
      if (cell.type === "blank") return compare(-number, operator);
      if (cell.type !== "number") return operator === "<>";
      return compare(cell.value === number ? 0 : cell.value < number ? -1 : 1, operator);
    };
  }
  if (operand === "" && match) return cell => compare(cell.type === "blank" || cell.type === "string" && cell.value === "" ? 0 : 1, operator);
  const lower = operand.toLowerCase();
  const pattern = !match && !/[?*~]/.test(lower) ? lower + "*" : lower;
  return cell => {
    if (cell.type === "error") return false;
    if (cell.type !== "string") return operator === "<>";
    context.operation(cell.value.length);
    const actual = cell.value.toLowerCase();
    if (operator === "=" || operator === "<>") {
      const equal = glob(pattern, actual, context);
      return operator === "=" ? equal : !equal;
    }
    return compare(actual === lower ? 0 : actual < lower ? -1 : 1, operator);
  };
}

function compensated(values: readonly number[], context: FunctionContext): number {
  let sum = 0, correction = 0;
  for (const value of values) {
    context.operation();
    const next = sum + value;
    correction += Math.abs(sum) >= Math.abs(value) ? (sum - next) + value : (value - next) + sum;
    sum = next;
  }
  return sum + correction;
}

function aggregate(name: string, values: readonly number[], context: FunctionContext): Scalar {
  const count = values.length;
  if (name === "DCOUNT") return functionNumber(count);
  if (name === "DPRODUCT") {
    let product = count ? 1 : 0;
    for (const value of values) { context.operation(); product *= value; if (!Number.isFinite(product)) return functionError("#NUM!"); }
    return functionNumber(product);
  }
  let scale = 0, minimum = Infinity, maximum = -Infinity;
  for (const value of values) { context.operation(); scale = Math.max(scale, Math.abs(value)); minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); }
  if (name === "DMAX") return functionNumber(count ? maximum : 0);
  if (name === "DMIN") return functionNumber(count ? minimum : 0);
  if (name === "DSUM" || name === "DAVERAGE") {
    if (!count && name === "DAVERAGE") return functionError("#DIV/0!");
    const sum = compensated(values, context);
    return functionNumber(name === "DAVERAGE" ? sum / count : sum);
  }
  const sample = name === "DVAR" || name === "DSTDEV";
  if (count < (sample ? 2 : 1)) return functionError("#DIV/0!");
  // Shift before scaling when possible to retain small spreads at large offsets.
  const anchor = values[0]!;
  let spread = 0;
  for (const value of values) { context.operation(); spread = Math.max(spread, Math.abs(value - anchor)); }
  const shifted = Number.isFinite(spread);
  const unit = shifted ? spread : scale;
  if (!unit) return functionNumber(0);
  const normalized = values.map(value => { context.operation(); return shifted ? (value - anchor) / unit : value / unit; });
  const mean = compensated(normalized, context) / count;
  const squares = normalized.map(value => { context.operation(); return (value - mean) ** 2; });
  const variance = compensated(squares, context) / (count - (sample ? 1 : 0));
  const unscaledVariance = (variance * unit) * unit;
  if (!Number.isFinite(unscaledVariance)) return functionError("#NUM!");
  if (name === "DSTDEV" || name === "DSTDEVP") return functionNumber(Math.sqrt(unscaledVariance));
  return functionNumber(unscaledVariance);
}

function database(name: string, arguments_: readonly FormulaExpression[], context: FunctionContext): Scalar {
  if (arguments_.length !== 3) return functionError();
  const data = range(arguments_[0]!, context);
  if (!("rows" in data)) return data;
  const fieldValue = context.evaluate(arguments_[1]!);
  // The integrated runtime uses kind:"omitted" for comma gaps. Keep compatible
  // with the initial runtime contract in category worktrees as it rolls out.
  const field = "kind" in fieldValue && String(fieldValue.kind) === "omitted" ? blank : functionScalar(fieldValue);
  if (field.type === "error") return field;
  const criteria = range(arguments_[2]!, context);
  if (!("rows" in criteria)) return criteria;
  const headers = data.rows[0]!;
  context.operation(headers.length);
  const labels = headers.map(header => functionText(header).toLowerCase());
  const omitted = (name === "DCOUNT" || name === "DCOUNTA") && (field.type === "blank" || field.type === "string" && field.value === "");
  const column = field.type === "number" ? Math.trunc(field.value) - 1 : field.type === "string" ? labels.indexOf(field.value.toLowerCase()) : -1;
  if (!omitted && (column < 0 || column >= headers.length)) return functionError();
  const columns = criteria.rows[0]!.map(header => { context.operation(headers.length); return labels.indexOf(functionText(header).toLowerCase()); });
  const predicates = criteria.rows.slice(1).map((row, r) => row.map((cell, c) => {
    context.operation();
    const index = columns[c]!;
    if (index < 0) {
      // A computed criterion is a formula, not a frozen Boolean result. The runtime
      // must re-evaluate it with translated relative references for every record.
      const input = context.cell({ sheet: criteria.reference.sheet, row: criteria.reference.firstRow + r + 1, column: criteria.reference.firstColumn + c });
      if (input?.formula) context.unavailable("Database computed criteria require row-relative formula evaluation");
      if (cell.type === "boolean") return { index, test: () => cell.value };
      if (cell.type === "blank" || cell.type === "string" && cell.value === "") return { index, test: () => true };
      return { index, test: () => false };
    }
    return { index, test: criterion(cell, context) };
  }));
  const numbers: number[] = [];
  let matches = 0, nonempty = 0;
  let selected: Scalar = blank;
  let error: Scalar | undefined;
  for (let r = 1; r < data.rows.length; r++) {
    context.operation();
    const row = data.rows[r]!;
    if (!predicates.some(criteriaRow => criteriaRow.every(({ index, test }) => { context.operation(); return test(row[index] ?? blank); }))) continue;
    matches++;
    selected = row[column] ?? blank;
    if (selected.type !== "blank") nonempty++;
    if (selected.type === "number") numbers.push(selected.value);
    else if (selected.type === "error") error ??= selected;
  }
  if (omitted) return functionNumber(matches);
  if (name === "DGET") return matches === 0 ? functionError() : matches > 1 ? functionError("#NUM!") : selected.type === "blank" ? functionError() : selected;
  if (name === "DCOUNTA") return functionNumber(nonempty);
  if (name !== "DCOUNT" && error) return error;
  return aggregate(name, numbers, context);
}

export const databaseFunctions: FunctionRegistry = new Map(names.map(name => [name, (arguments_, context) => database(name, arguments_, context)]));
