import type { FormulaErrorValue, FormulaExpression, FormulaReferenceExpression, ParsedFormula } from "./ast.ts";
import { FormulaParseError, parseFormula } from "./parser.ts";

export type FormulaScalarValue =
  | { readonly type: "blank" }
  | { readonly type: "boolean"; readonly value: boolean }
  | { readonly type: "error"; readonly value: FormulaErrorValue }
  | { readonly type: "number"; readonly value: number }
  | { readonly type: "string"; readonly value: string };

export interface FormulaCellAddress {
  /** Stable source-defined sheet identity, not necessarily its visible name. */
  readonly sheet: string;
  readonly row: number;
  readonly column: number;
}

export interface FormulaCellInput {
  readonly formula: string | undefined;
  readonly value: FormulaScalarValue;
}

export interface FormulaWorkbookSource {
  readonly formulaCells: Iterable<{ readonly address: FormulaCellAddress; readonly formula: string }>;
  cell(address: FormulaCellAddress): FormulaCellInput | undefined;
  resolveSheet(currentSheet: string, name: string): string | undefined;
}

export type FormulaDiagnosticCode =
  | "circular-reference"
  | "evaluation-limit"
  | "parse-error"
  | "unavailable-dependency"
  | "unsupported-function";

export interface FormulaDiagnostic {
  readonly code: FormulaDiagnosticCode;
  readonly address: FormulaCellAddress;
  readonly formula: string;
  readonly message: string;
}

export interface FormulaCalculationOptions {
  readonly maxFormulaCells?: number;
  readonly maxRangeCells?: number;
  readonly maxOperations?: number;
  readonly maxEvaluationDepth?: number;
}

export class FormulaCalculation {
  readonly diagnostics: readonly FormulaDiagnostic[];
  readonly #values: ReadonlyMap<string, FormulaScalarValue>;
  readonly #dependencies: ReadonlyMap<string, readonly FormulaCellAddress[]>;

  constructor(
    values: ReadonlyMap<string, FormulaScalarValue>,
    dependencies: ReadonlyMap<string, readonly FormulaCellAddress[]>,
    diagnostics: readonly FormulaDiagnostic[],
  ) {
    this.#values = new Map(values);
    this.#dependencies = new Map(dependencies);
    this.diagnostics = Object.freeze([...diagnostics]);
  }

  /** Returns only a value calculated by this engine; cached fallbacks remain source-owned. */
  value(address: FormulaCellAddress): FormulaScalarValue | undefined {
    return this.#values.get(addressKey(address));
  }

  dependencies(address: FormulaCellAddress): readonly FormulaCellAddress[] {
    return this.#dependencies.get(addressKey(address)) ?? Object.freeze([]);
  }
}

/** Calculates supported formulas without mutating the source or treating cached values as calculated output. */
export function calculateFormulas(
  source: FormulaWorkbookSource,
  options: FormulaCalculationOptions = {},
): FormulaCalculation {
  const limits = {
    maxFormulaCells: options.maxFormulaCells ?? 100_000,
    maxRangeCells: options.maxRangeCells ?? 100_000,
    maxOperations: options.maxOperations ?? 1_000_000,
    maxEvaluationDepth: options.maxEvaluationDepth ?? 1_000,
  };
  const formulaCells = [...source.formulaCells];
  if (formulaCells.length > limits.maxFormulaCells) throw new RangeError("Formula cell count exceeds the calculation limit.");
  const parsed = new Map<string, ParsedFormula>();
  const values = new Map<string, FormulaScalarValue>();
  const memo = new Map<string, FormulaScalarValue>();
  const unavailable = new Map<string, EvaluationUnavailable>();
  const dependencies = new Map<string, readonly FormulaCellAddress[]>();
  const diagnostics: FormulaDiagnostic[] = [];
  const diagnosed = new Set<string>();
  const visiting = new Set<string>();
  let operations = 0;

  const operation = () => {
    operations += 1;
    if (operations > limits.maxOperations) throw new EvaluationUnavailable("evaluation-limit", "Formula operation limit exceeded.");
  };

  const parse = (address: FormulaCellAddress, formula: string): ParsedFormula => {
    const key = addressKey(address);
    const existing = parsed.get(key);
    if (existing !== undefined) return existing;
    try {
      const result = parseFormula(formula);
      parsed.set(key, result);
      const refs = collectReferences(result.expression, address.sheet, source, limits.maxRangeCells);
      dependencies.set(key, Object.freeze(refs));
      return result;
    } catch (cause) {
      if (cause instanceof FormulaParseError) throw new EvaluationUnavailable("parse-error", cause.message);
      if (cause instanceof EvaluationUnavailable) throw cause;
      throw cause;
    }
  };

  const cellValue = (address: FormulaCellAddress, depth: number, asDependency: boolean): FormulaScalarValue => {
    operation();
    if (depth > limits.maxEvaluationDepth) throw new EvaluationUnavailable("evaluation-limit", "Formula evaluation depth exceeded.");
    const key = addressKey(address);
    const knownFailure = unavailable.get(key);
    if (knownFailure !== undefined) {
      if (asDependency) throw knownFailure;
      return readCell(source, address)?.value ?? BLANK;
    }
    const remembered = memo.get(key);
    if (remembered !== undefined) return remembered;
    const input = readCell(source, address);
    if (input?.formula === undefined) return input?.value ?? BLANK;
    if (visiting.has(key)) throw new EvaluationUnavailable("circular-reference", "Formula contains a circular reference.");
    visiting.add(key);
    try {
      const expression = parse(address, input.formula).expression;
      const result = scalar(evaluate(expression, address.sheet, depth + 1));
      memo.set(key, result);
      values.set(key, result);
      return result;
    } catch (cause) {
      if (!(cause instanceof EvaluationUnavailable)) throw cause;
      diagnose(address, input.formula, cause);
      if (cause.code === "circular-reference") {
        unavailable.set(key, cause);
        if (asDependency) throw cause;
        return input.value;
      }
      memo.set(key, input.value);
      return input.value;
    } finally {
      visiting.delete(key);
    }
  };

  const evaluate = (expression: FormulaExpression, sheet: string, depth: number): EvaluationValue => {
    operation();
    switch (expression.kind) {
      case "number": return number(expression.value);
      case "string": return string(expression.value);
      case "boolean": return boolean(expression.value);
      case "error": return error(expression.value);
      case "reference": return referenceValue(expression, sheet, depth);
      case "unary": {
        const value = numeric(scalar(evaluate(expression.operand, sheet, depth + 1)));
        return value.type === "error" ? value : number(expression.operator === "-" ? -value.value : value.value);
      }
      case "percent": {
        const value = numeric(scalar(evaluate(expression.operand, sheet, depth + 1)));
        return value.type === "error" ? value : number(value.value / 100);
      }
      case "binary": return binary(expression, sheet, depth);
      case "function": return call(expression.name, expression.arguments, sheet, depth);
    }
  };

  const referenceValue = (expression: FormulaReferenceExpression, currentSheet: string, depth: number): EvaluationValue => {
    const sheet = expression.sheet === undefined ? currentSheet : source.resolveSheet(currentSheet, expression.sheet);
    if (sheet === undefined) return error("#REF!");
    if (expression.endReference === undefined) {
      return cellValue({ sheet, row: expression.startReference.row, column: expression.startReference.column }, depth + 1, true);
    }
    const addresses = rangeAddresses(sheet, expression, limits.maxRangeCells);
    return Object.freeze({ kind: "range", values: Object.freeze(addresses.map((address) => cellValue(address, depth + 1, true))) });
  };

  const binary = (expression: Extract<FormulaExpression, { kind: "binary" }>, sheet: string, depth: number): FormulaScalarValue => {
    const left = scalar(evaluate(expression.left, sheet, depth + 1));
    if (left.type === "error") return left;
    const right = scalar(evaluate(expression.right, sheet, depth + 1));
    if (right.type === "error") return right;
    if (expression.operator === "&") return string(text(left) + text(right));
    if (["=", "<>", "<", "<=", ">", ">="].includes(expression.operator)) {
      const comparison = compare(left, right);
      switch (expression.operator) {
        case "=": return boolean(comparison === 0);
        case "<>": return boolean(comparison !== 0);
        case "<": return boolean(comparison < 0);
        case "<=": return boolean(comparison <= 0);
        case ">": return boolean(comparison > 0);
        case ">=": return boolean(comparison >= 0);
      }
    }
    const leftNumber = numeric(left);
    if (leftNumber.type === "error") return leftNumber;
    const rightNumber = numeric(right);
    if (rightNumber.type === "error") return rightNumber;
    switch (expression.operator) {
      case "+": return finite(leftNumber.value + rightNumber.value);
      case "-": return finite(leftNumber.value - rightNumber.value);
      case "*": return finite(leftNumber.value * rightNumber.value);
      case "/": return rightNumber.value === 0 ? error("#DIV/0!") : finite(leftNumber.value / rightNumber.value);
      case "^": return finite(leftNumber.value ** rightNumber.value);
      default: return error("#VALUE!");
    }
  };

  const call = (name: string, args: readonly FormulaExpression[], sheet: string, depth: number): FormulaScalarValue => {
    if (name === "IF") {
      if (args.length < 2 || args.length > 3) return error("#VALUE!");
      const condition = logical(scalar(evaluate(args[0]!, sheet, depth + 1)));
      if (condition.type === "error") return condition;
      const branch = condition.value ? args[1]! : args[2];
      return branch === undefined ? boolean(false) : scalar(evaluate(branch, sheet, depth + 1));
    }
    if (!SUPPORTED_FUNCTIONS.has(name)) throw new EvaluationUnavailable("unsupported-function", `Function ${name} is not supported.`);
    const evaluated = args.map((argument) => evaluate(argument, sheet, depth + 1));
    const firstError = flatten(evaluated).find((value) => value.type === "error");
    if (firstError?.type === "error") return firstError;
    switch (name) {
      case "SUM": return finite(numbersForAggregate(evaluated).reduce((sum, value) => sum + value, 0));
      case "COUNT": return number(numbersForAggregate(evaluated).length);
      case "AVERAGE": {
        const values = numbersForAggregate(evaluated);
        return values.length === 0 ? error("#DIV/0!") : finite(values.reduce((sum, value) => sum + value, 0) / values.length);
      }
      case "MIN": {
        const values = numbersForAggregate(evaluated);
        return finite(values.length === 0 ? 0 : Math.min(...values));
      }
      case "MAX": {
        const values = numbersForAggregate(evaluated);
        return finite(values.length === 0 ? 0 : Math.max(...values));
      }
      case "AND": return logicalAggregate(evaluated, true);
      case "OR": return logicalAggregate(evaluated, false);
      case "NOT": {
        if (evaluated.length !== 1) return error("#VALUE!");
        const value = logical(scalar(evaluated[0]!));
        return value.type === "error" ? value : boolean(!value.value);
      }
      default: throw new EvaluationUnavailable("unsupported-function", `Function ${name} is not supported.`);
    }
  };

  const diagnose = (address: FormulaCellAddress, formula: string, failure: EvaluationUnavailable) => {
    const key = `${addressKey(address)}\u0000${failure.code}`;
    if (diagnosed.has(key)) return;
    diagnosed.add(key);
    diagnostics.push(Object.freeze({ code: failure.code, address: freezeAddress(address), formula, message: failure.message }));
  };

  for (const formulaCell of formulaCells) {
    try {
      cellValue(formulaCell.address, 0, false);
    } catch (cause) {
      if (cause instanceof EvaluationUnavailable) diagnose(formulaCell.address, formulaCell.formula, cause);
      else throw cause;
    }
  }
  return new FormulaCalculation(values, dependencies, diagnostics);
}

type RangeEvaluationValue = { readonly kind: "range"; readonly values: readonly FormulaScalarValue[] };
type EvaluationValue = FormulaScalarValue | RangeEvaluationValue;

class EvaluationUnavailable extends Error {
  readonly code: FormulaDiagnosticCode;

  constructor(code: FormulaDiagnosticCode, message: string) {
    super(message);
    this.name = "EvaluationUnavailable";
    this.code = code;
  }
}

const BLANK = Object.freeze({ type: "blank" as const });
const SUPPORTED_FUNCTIONS = new Set(["SUM", "COUNT", "AVERAGE", "MIN", "MAX", "AND", "OR", "NOT"]);

function collectReferences(
  expression: FormulaExpression,
  currentSheet: string,
  source: FormulaWorkbookSource,
  maxRangeCells: number,
): FormulaCellAddress[] {
  const result: FormulaCellAddress[] = [];
  const visit = (node: FormulaExpression) => {
    switch (node.kind) {
      case "reference": {
        const sheet = node.sheet === undefined ? currentSheet : source.resolveSheet(currentSheet, node.sheet);
        if (sheet !== undefined) result.push(...rangeAddresses(sheet, node, maxRangeCells));
        break;
      }
      case "unary":
      case "percent": visit(node.operand); break;
      case "binary": visit(node.left); visit(node.right); break;
      case "function": node.arguments.forEach(visit); break;
      default: break;
    }
  };
  visit(expression);
  const unique = new Map(result.map((address) => [addressKey(address), address]));
  return [...unique.values()];
}

function rangeAddresses(sheet: string, reference: FormulaReferenceExpression, maxRangeCells: number): FormulaCellAddress[] {
  const end = reference.endReference ?? reference.startReference;
  const firstRow = Math.min(reference.startReference.row, end.row);
  const lastRow = Math.max(reference.startReference.row, end.row);
  const firstColumn = Math.min(reference.startReference.column, end.column);
  const lastColumn = Math.max(reference.startReference.column, end.column);
  const count = (lastRow - firstRow + 1) * (lastColumn - firstColumn + 1);
  if (!Number.isSafeInteger(count) || count > maxRangeCells) throw new EvaluationUnavailable("evaluation-limit", "Formula range exceeds the calculation limit.");
  const result: FormulaCellAddress[] = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) result.push(Object.freeze({ sheet, row, column }));
  }
  return result;
}

function scalar(value: EvaluationValue): FormulaScalarValue {
  return isRange(value) ? error("#VALUE!") : value;
}

function flatten(values: readonly EvaluationValue[]): FormulaScalarValue[] {
  return values.flatMap((value) => isRange(value) ? value.values : [value]);
}

function numbersForAggregate(values: readonly EvaluationValue[]): number[] {
  return values.flatMap((value) => {
    if (isRange(value)) return value.values.flatMap((cell) => cell.type === "number" ? [cell.value] : []);
    if (value.type === "number") return [value.value];
    if (value.type === "boolean") return [value.value ? 1 : 0];
    if (value.type === "string" && value.value.trim() !== "") {
      const parsed = Number(value.value);
      if (Number.isFinite(parsed)) return [parsed];
    }
    return [];
  });
}

function logicalAggregate(values: readonly EvaluationValue[], and: boolean): FormulaScalarValue {
  const logicals = flatten(values).flatMap((value) => {
    if (value.type === "boolean") return [value.value];
    if (value.type === "number") return [value.value !== 0];
    return [];
  });
  if (logicals.length === 0) return error("#VALUE!");
  return boolean(and ? logicals.every(Boolean) : logicals.some(Boolean));
}

function numeric(value: FormulaScalarValue): Extract<FormulaScalarValue, { type: "number" | "error" }> {
  switch (value.type) {
    case "number": return value;
    case "blank": return number(0);
    case "boolean": return number(value.value ? 1 : 0);
    case "string": {
      const parsed = Number(value.value);
      return Number.isFinite(parsed) && value.value.trim() !== "" ? number(parsed) : error("#VALUE!");
    }
    case "error": return value;
  }
}

function logical(value: FormulaScalarValue): Extract<FormulaScalarValue, { type: "boolean" | "error" }> {
  switch (value.type) {
    case "boolean": return value;
    case "number": return boolean(value.value !== 0);
    case "blank": return boolean(false);
    case "string": {
      const normalized = value.value.toUpperCase();
      return normalized === "TRUE" ? boolean(true) : normalized === "FALSE" ? boolean(false) : error("#VALUE!");
    }
    case "error": return value;
  }
}

function compare(left: FormulaScalarValue, right: FormulaScalarValue): number {
  if (left.type === "number" && right.type === "number") return left.value - right.value;
  if (left.type === "boolean" && right.type === "boolean") return Number(left.value) - Number(right.value);
  if (left.type === "blank" && right.type === "blank") return 0;
  return text(left).localeCompare(text(right), "en-US", { sensitivity: "base", numeric: true });
}

function text(value: FormulaScalarValue): string {
  switch (value.type) {
    case "blank": return "";
    case "boolean": return value.value ? "TRUE" : "FALSE";
    case "number": return String(value.value);
    case "string": return value.value;
    case "error": return value.value;
  }
}

function finite(value: number): Extract<FormulaScalarValue, { type: "number" | "error" }> {
  return Number.isFinite(value) ? number(Object.is(value, -0) ? 0 : value) : error("#NUM!");
}

function number(value: number): Extract<FormulaScalarValue, { type: "number" }> {
  return Object.freeze({ type: "number", value });
}

function string(value: string): Extract<FormulaScalarValue, { type: "string" }> {
  return Object.freeze({ type: "string", value });
}

function boolean(value: boolean): Extract<FormulaScalarValue, { type: "boolean" }> {
  return Object.freeze({ type: "boolean", value });
}

function error(value: FormulaErrorValue): Extract<FormulaScalarValue, { type: "error" }> {
  return Object.freeze({ type: "error", value });
}

function freezeAddress(address: FormulaCellAddress): FormulaCellAddress {
  if (!Number.isSafeInteger(address.row) || address.row < 1 || !Number.isSafeInteger(address.column) || address.column < 1 || address.sheet.length === 0) {
    throw new RangeError("Formula cell address is invalid.");
  }
  return Object.freeze({ ...address });
}

function addressKey(address: FormulaCellAddress): string {
  return `${address.sheet}\u0000${address.row}\u0000${address.column}`;
}

function isRange(value: EvaluationValue): value is RangeEvaluationValue {
  return "kind" in value && value.kind === "range";
}

function readCell(source: FormulaWorkbookSource, address: FormulaCellAddress): FormulaCellInput | undefined {
  try {
    return source.cell(address);
  } catch {
    throw new EvaluationUnavailable("unavailable-dependency", "Formula dependency could not be read.");
  }
}
