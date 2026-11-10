import type { FormulaExpression } from "./ast.ts";
import type { FormulaCellAddress, FormulaCellInput, FormulaScalarValue, FormulaWorkbookSource } from "./evaluator.ts";

/** Values passed between the extended function families and the evaluator. */
export type FunctionValue = FormulaScalarValue | FunctionArray | FunctionLambda | FunctionOmitted;

export interface FunctionOmitted { readonly kind: "omitted"; }

export interface FunctionArray {
  readonly kind: "array";
  readonly rows: readonly (readonly FormulaScalarValue[])[];
}

export interface FunctionLambda {
  readonly kind: "lambda";
  readonly parameters: readonly string[];
  invoke(arguments_: readonly FunctionValue[]): FunctionValue;
}

export interface FunctionReference {
  readonly sheet: string;
  readonly firstRow: number;
  readonly firstColumn: number;
  readonly height: number;
  readonly width: number;
}

/** Explicit, synchronous host capabilities. The evaluator never performs implicit IO. */
export interface FormulaFunctionServices {
  invoke(name: string, arguments_: readonly FunctionValue[], address: FormulaCellAddress): FunctionValue | undefined;
}

export interface FunctionContext {
  readonly address: FormulaCellAddress;
  readonly source: FormulaWorkbookSource;
  readonly dateSystem: "1900" | "1904";
  readonly maxArrayCells: number;
  readonly services: FormulaFunctionServices | undefined;
  evaluate(expression: FormulaExpression): FunctionValue;
  /** Preserve reference provenance and bound blank-insensitive whole-axis scans. */
  evaluateAggregate(expression: FormulaExpression): FunctionValue;
  /** Invoke a registered function with already evaluated values. */
  call(name: string, arguments_: readonly FunctionValue[]): FunctionValue;
  /** Evaluate in a child lexical scope; optionally preserve reference provenance for LET/LAMBDA values and returns. */
  withBindings(bindings: ReadonlyMap<string, FunctionValue>, expression: FormulaExpression, preserveReference?: boolean): FunctionValue;
  /** Resolve geometry in the caller's sheet, or an explicit source sheet scope. */
  reference(expression: FormulaExpression, sheet?: string): FunctionReference | FormulaScalarValue;
  readReference(reference: FunctionReference): FunctionValue;
  cell(address: FormulaCellAddress): FormulaCellInput | undefined;
  /** Charge work to the evaluator's bounded operation budget. */
  operation(count?: number): void;
  /** A clock and RNG injected by calculation options, stable for a calculation. */
  now(): Date;
  random(): number;
  /** Preserve producer caches rather than claiming an unavailable capability ran. */
  unavailable(message: string): never;
}

export type ExtendedFunction = (arguments_: readonly FormulaExpression[], context: FunctionContext) => FunctionValue;
export type FunctionRegistry = ReadonlyMap<string, ExtendedFunction>;

export function functionError(value: `#${string}` = "#VALUE!"): FormulaScalarValue {
  return { type: "error", value };
}

export function functionNumber(value: number): FormulaScalarValue {
  return Number.isFinite(value) ? { type: "number", value } : functionError("#NUM!");
}

export function functionScalar(value: FunctionValue): FormulaScalarValue {
  return "kind" in value ? value.kind === "omitted" ? { type: "blank" } : functionError() : value;
}

export function functionMatrix(value: FunctionValue): readonly (readonly FormulaScalarValue[])[] {
  if (!("kind" in value)) return [[value]];
  return value.kind === "omitted" ? [[{type: "blank"}]] : value.kind === "array" ? value.rows : [[functionError("#CALC!")]];
}

export function functionFlatten(value: FunctionValue): readonly FormulaScalarValue[] {
  return functionMatrix(value).flat();
}

export function functionNumeric(value: FormulaScalarValue): FormulaScalarValue {
  if (value.type === "number" || value.type === "error") return value;
  if (value.type === "blank") return functionNumber(0);
  if (value.type === "boolean") return functionNumber(value.value ? 1 : 0);
  const text = value.value.trim();
  return text !== "" && Number.isFinite(Number(text)) ? functionNumber(Number(text)) : functionError();
}

export function functionText(value: FormulaScalarValue): string {
  switch (value.type) {
    case "blank": return "";
    case "boolean": return value.value ? "TRUE" : "FALSE";
    case "number": return String(value.value);
    case "string": return value.value;
    case "error": return value.value;
  }
}
