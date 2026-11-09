import { extendedFunctions } from "./extended-functions.ts";
import type { FunctionValue, FunctionArray, FunctionReference, FunctionContext, FunctionRegistry, FormulaFunctionServices } from "./function-runtime.ts";
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
  readonly numberFormatId?: number;
  readonly numberFormatCode?: string;
  readonly formula: string | undefined;
  readonly value: FormulaScalarValue;
}

export interface FormulaRowVisibility {
  /** The row is outside the current AutoFilter result. */
  readonly filteredOut: boolean;
  /** The row is hidden manually or by an outline, independently of filtering. */
  readonly manuallyHidden: boolean;
  /** False when the adapter cannot classify the row without guessing. */
  readonly determinate: boolean;
}

export interface FormulaWorkbookSource {
  readonly formulaCells: Iterable<{ readonly address: FormulaCellAddress; readonly formula: string }>;
  cell(address: FormulaCellAddress): FormulaCellInput | undefined;
  resolveSheet(currentSheet: string, name: string): string | undefined;
  sheetNames?(): readonly string[];
  sheetIndex?(sheet: string): number | undefined;
  usedDimensions?(sheet: string): { readonly rows: number; readonly columns: number };
  resolveName?(name: string, address: FormulaCellAddress): FormulaExpression | FunctionReference | undefined;
  spillBlocked?(address: FormulaCellAddress): boolean;
  rowVisibility?(sheet: string, row: number): FormulaRowVisibility;
}

export type FormulaDiagnosticCode =
  | "circular-reference"
  | "evaluation-limit"
  | "parse-error"
  | "unavailable-dependency"
  | "unsupported-reference"
  | "unsupported-function";

export interface FormulaDiagnostic {
  readonly code: FormulaDiagnosticCode;
  readonly address: FormulaCellAddress;
  readonly formula: string;
  readonly message: string;
}

export interface FormulaCalculationOptions {
  /** Workbook date system used by date functions. Defaults to the OOXML 1900 system. */
  readonly dateSystem?: "1900" | "1904";
  readonly functionRegistries?: readonly FunctionRegistry[];
  readonly services?: FormulaFunctionServices;
  readonly now?: () => Date;
  readonly random?: () => number;
  readonly maxArrayCells?: number;
  readonly maxFormulaCells?: number;
  readonly maxRangeCells?: number;
  readonly maxOperations?: number;
  readonly maxEvaluationDepth?: number;
}

export class FormulaCalculation {
  readonly diagnostics: readonly FormulaDiagnostic[];
  readonly #values: ReadonlyMap<string, FormulaScalarValue>;
  readonly #arrays: ReadonlyMap<string, FunctionArray>;
  readonly #dependencies: ReadonlyMap<string, readonly FormulaCellAddress[]>;

  constructor(
    values: ReadonlyMap<string, FormulaScalarValue>,
    dependencies: ReadonlyMap<string, readonly FormulaCellAddress[]>,
    diagnostics: readonly FormulaDiagnostic[],
    arrays: ReadonlyMap<string, FunctionArray> = new Map(),
  ) {
    this.#values = new Map(values);
    this.#arrays = new Map(arrays);
    this.#dependencies = new Map([...dependencies].map(([key, refs]) => [key, Object.freeze([...refs])]));
    this.diagnostics = Object.freeze([...diagnostics]);
  }

  /** Returns only a value calculated by this engine; cached fallbacks remain source-owned. */
  value(address: FormulaCellAddress): FormulaScalarValue | undefined {
    return this.#values.get(addressKey(address));
  }

  arrayValue(address: FormulaCellAddress): FunctionArray | undefined {
    return this.#arrays.get(addressKey(address));
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
    maxArrayCells: options.maxArrayCells ?? options.maxRangeCells ?? 100_000,
    maxRangeCells: options.maxRangeCells ?? 100_000,
    maxOperations: options.maxOperations ?? 1_000_000,
    maxEvaluationDepth: options.maxEvaluationDepth ?? 1_000,
  };
  const dateSystem = options.dateSystem ?? "1900";
  const formulaCells = [...source.formulaCells];
  if (formulaCells.length > limits.maxFormulaCells) throw new RangeError("Formula cell count exceeds the calculation limit.");
  const capturedNow = new Date((options.now?.() ?? new Date()).getTime());
  let activeAddress: FormulaCellAddress = { sheet: "", row: 1, column: 1 };
  let bindings: ReadonlyMap<string, FunctionValue> = new Map();
  let publicExpression: FormulaExpression | undefined;
  const registries = [extendedFunctions, ...(options.functionRegistries ?? [])];
  const arrays = new Map<string, FunctionArray>();
  const spillOwners = new Map<string, string>();
  const parsed = new Map<string, ParsedFormula>();
  const values = new Map<string, FormulaScalarValue>();
  const memo = new Map<string, FormulaScalarValue>();
  const unavailable = new Map<string, EvaluationUnavailable>();
  const dependencies = new Map<string, FormulaCellAddress[]>();
  const dependencyKeys = new Map<string, Set<string>>();
  const wholeDependencies = new Map<string, FunctionReference[]>();
  const diagnostics: FormulaDiagnostic[] = [];
  const diagnosed = new Set<string>();
  const visiting = new Set<string>();
  const dirtyActive = new Set<string>();
  const aggregateFormulaCells = new Map<string, boolean>();
  let operations = 0;
  let evaluationFrames = 0;

  const operation = (count = 1) => {
    if (!Number.isSafeInteger(count) || count < 0) throw new RangeError("Invalid operation charge.");
    operations += count;
    if (operations > limits.maxOperations) throw new EvaluationUnavailable("evaluation-limit", "Formula operation limit exceeded.");
  };

  const parse = (address: FormulaCellAddress, formula: string): ParsedFormula => {
    const key = addressKey(address);
    const existing = parsed.get(key);
    if (existing !== undefined) return existing;
    try {
      const result = parseFormula(formula);
      walkExpression(result.expression, node => {
        if (node.kind === "function" && normalizeFunctionName(node.name) === "PY" && node !== result.expression) throw new EvaluationUnavailable("unsupported-function", "PY must be a standalone public formula.");
      });
      parsed.set(key, result);
      const refs = collectReferences(result.expression, address.sheet, source, limits.maxRangeCells);
      const whole: FunctionReference[] = [];
      walkExpression(result.expression, node => {
        if (node.kind === "reference" && node.whole) {
          const ref = referenceGeometry(node, address.sheet, source);
          if (!("type" in ref)) whole.push(ref);
        }
      });
      wholeDependencies.set(key, whole);
      dependencies.set(key, refs);
      dependencyKeys.set(key, new Set(refs.map(addressKey)));
      return result;
    } catch (cause) {
      if (cause instanceof FormulaParseError) throw new EvaluationUnavailable("parse-error", cause.message);
      if (cause instanceof EvaluationUnavailable) throw cause;
      throw cause;
    }
  };

  function recordDependency(address: FormulaCellAddress): void {
    if (!visiting.size) return;
    const owner = addressKey(activeAddress), key = addressKey(address);
    const keys = dependencyKeys.get(owner) ?? new Set<string>();
    if (keys.has(key)) return;
    keys.add(key); dependencyKeys.set(owner, keys);
    const refs = dependencies.get(owner) ?? [];
    refs.push(freezeAddress(address)); dependencies.set(owner, refs);
  }

  function invalidateDependants(changed: ReadonlySet<string>): void {
    const pending = new Set(changed);
    let invalidated = true;
    while (invalidated) {
      invalidated = false;
      for (const [key, refs] of dependencies) {
        operation();
        if (pending.has(key) || (!visiting.has(key) && !memo.has(key)) || !(refs.some(ref => pending.has(addressKey(ref))) || (wholeDependencies.get(key) ?? []).some(ref => [...pending].some(target => {
          operation();
          const [sheet, row, column] = target.split("\u0000");
          return sheet === ref.sheet && Number(row) >= ref.firstRow && Number(row) < ref.firstRow + ref.height && Number(column) >= ref.firstColumn && Number(column) < ref.firstColumn + ref.width;
        })))) continue;
        if (visiting.has(key)) dirtyActive.add(key);
        memo.delete(key); values.delete(key);
        if (arrays.delete(key)) {
          for (const [target, owner] of spillOwners) if (owner === key) { spillOwners.delete(target); values.delete(target); pending.add(target); }
        }
        pending.add(key); invalidated = true;
      }
    }
  }

  const cellValue = (address: FormulaCellAddress, depth: number, asDependency: boolean): FormulaScalarValue => {
    operation();
    if (depth > limits.maxEvaluationDepth) throw new EvaluationUnavailable("evaluation-limit", "Formula evaluation depth exceeded.");
    const key = addressKey(address);
    recordDependency(address);
    const overlay = values.get(key);
    const spillOwner = spillOwners.get(key);
    if (spillOwner !== undefined && overlay !== undefined) {
      const [sheet, row, column] = spillOwner.split("\u0000");
      recordDependency({sheet: sheet!, row: Number(row), column: Number(column)});
      return overlay;
    }
    const knownFailure = unavailable.get(key);
    if (knownFailure !== undefined) {
      if (asDependency) throw knownFailure;
      return readCell(source, address)?.value ?? BLANK;
    }
    const remembered = memo.get(key);
    if (remembered !== undefined) return remembered;
    const input = readCell(source, address);
    if (input?.formula === undefined) {
      const value = input?.value ?? BLANK;
      // Entered constants have a smaller documented domain than formula results.
      return value.type === "number" && Math.abs(value.value) > 9.99999999999999e307 ? error("#NUM!") : value;
    }
    if (visiting.has(key)) throw new EvaluationUnavailable("circular-reference", "Formula contains a circular reference.");
    visiting.add(key);
    const previousAddress = activeAddress, previousBindings = bindings, previousPublic = publicExpression;
    activeAddress = Object.freeze({...address});
    bindings = new Map();
    try {
      const expression = parse(address, input.formula).expression;
      publicExpression = expression;
      const evaluated = toFunction(evaluate(expression, address.sheet, depth + 1));
      let result = scalar(evaluated);
      if (result.type === "blank") result = number(0);
      if ("kind" in evaluated && evaluated.kind === "array") {
        const rows = evaluated.rows, height = rows.length, width = rows[0]?.length ?? 0;
        assertArray(height, width);
        if (rows.some(row => row.length !== width)) throw new EvaluationUnavailable("unavailable-dependency", "Function returned a nonrectangular array.");
        let blocked = source.spillBlocked?.(address) === true || address.row + height - 1 > MAX_SPREADSHEET_ROW || address.column + width - 1 > MAX_SPREADSHEET_COLUMN;
        for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
          operation();
          if (!r && !c) continue;
          const target = {sheet: address.sheet, row: address.row + r, column: address.column + c};
          const input = readCell(source, target);
          if (input?.formula !== undefined || input !== undefined && input.value.type !== "blank" || spillOwners.has(addressKey(target)) || source.spillBlocked?.(target)) blocked = true;
        }
        result = blocked ? error("#SPILL!") : rows[0]![0]!;
        if (!blocked) {
          const copy: FunctionArray = Object.freeze({kind: "array", rows: Object.freeze(rows.map(row => Object.freeze([...row])))});
          arrays.set(key, copy);
          const changed = new Set<string>();
          for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
            const target = addressKey({sheet: address.sheet, row: address.row + r, column: address.column + c});
            values.set(target, rows[r]![c]!);
            if (r || c) { spillOwners.set(target, key); changed.add(target); }
          }
          if (changed.size) invalidateDependants(changed);
        }
      }
      if (dirtyActive.delete(key)) {
        // A dependency published a spill after this active frame read a blank.
        // Leave it and all marked ancestors uncached for the next calculation pass.
        memo.delete(key); values.delete(key); arrays.delete(key);
        for (const [target, owner] of spillOwners) if (owner === key) { spillOwners.delete(target); values.delete(target); }
      } else {
        memo.set(key, result);
        values.set(key, result);
      }
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
      activeAddress = previousAddress; bindings = previousBindings; publicExpression = previousPublic;
    }
  };

  const evaluate = (expression: FormulaExpression, sheet: string, depth: number): EvaluationValue => {
    operation();
    evaluationFrames++;
    try {
    if (evaluationFrames > limits.maxEvaluationDepth) throw new EvaluationUnavailable("evaluation-limit", "Formula evaluation depth exceeded.");
    if (depth > limits.maxEvaluationDepth) throw new EvaluationUnavailable("evaluation-limit", "Formula evaluation depth exceeded.");
    switch (expression.kind) {
      case "value": return expression.value;
      case "omitted": return {kind: "omitted"};
      case "name": {
        const bound = bindings.get(normalizeBindingName(expression.name));
        if (bound !== undefined) return bound;
        if (/^_xlpm\./i.test(expression.name)) return error("#NAME?");
        const named = source.resolveName?.(expression.name, activeAddress);
        return named === undefined ? error("#NAME?") : "kind" in named ? evaluate(named, sheet, depth + 1) : readReference(named, depth);
      }
      case "array": {
        assertArray(expression.rows.length, expression.rows[0]?.length ?? 0);
        return {kind: "array", rows: expression.rows.map(row => row.map(item => scalar(evaluate(item, sheet, depth + 1))))};
      }
      case "invoke": {
        const callee = toFunction(evaluate(expression.callee, sheet, depth + 1));
        return "kind" in callee && callee.kind === "lambda" ? callee.invoke(expression.arguments.map(arg => toFunction(evaluate(arg, sheet, depth + 1)))) : error("#VALUE!");
      }
      case "spill": {
        const ref = resolveReference(expression.operand, sheet, depth);
        if ("type" in ref) return ref;
        cellValue({sheet: ref.sheet, row: ref.firstRow, column: ref.firstColumn}, depth + 1, true);
        return arrays.get(addressKey({sheet: ref.sheet, row: ref.firstRow, column: ref.firstColumn})) ?? error("#REF!");
      }
      case "intersection": {
        const ref = resolveReference(expression.operand, sheet, depth);
        if (!("type" in ref)) {
          const row = ref.height === 1 ? ref.firstRow : activeAddress.row;
          const column = ref.width === 1 ? ref.firstColumn : activeAddress.column;
          if (row < ref.firstRow || row >= ref.firstRow + ref.height || column < ref.firstColumn || column >= ref.firstColumn + ref.width) return error("#VALUE!");
          return cellValue({sheet: ref.sheet, row, column}, depth + 1, true);
        }
        return matrix(evaluate(expression.operand, sheet, depth + 1))[0]?.[0] ?? error("#VALUE!");
      }
      case "number": return number(expression.value);
      case "string": return string(expression.value);
      case "boolean": return boolean(expression.value);
      case "error": return error(expression.value);
      case "reference": return referenceValue(expression, sheet, depth);
      case "unary": case "percent": {
        return mapValues(evaluate(expression.operand, sheet, depth + 1), number(0), (item) => {
          const value = numeric(item);
          return value.type === "error" ? value : finite(expression.kind === "percent" ? value.value / 100 : expression.operator === "-" ? -value.value : value.value);
        });
      }
      case "binary": return binary(expression, sheet, depth);
      case "function": return call(expression.name, expression.arguments, sheet, depth);
    }
    } finally { evaluationFrames--; }
  };

  function referenceResult(value: FunctionValue): EvaluationValue {
    if ("kind" in value && value.kind !== "array") return value;
    const rows = matrix(value);
    return {kind: "range", rows, values: rows.flat()};
  }

  const referenceValue = (expression: FormulaReferenceExpression, currentSheet: string, depth: number): EvaluationValue => {
    const ref = resolveReference(expression, currentSheet, depth + 1);
    if ("type" in ref) return ref;
    return referenceResult(readReference(ref, depth + 1));
  };

  const binary = (expression: Extract<FormulaExpression, { kind: "binary" }>, sheet: string, depth: number): EvaluationValue => mapValues(evaluate(expression.left, sheet, depth + 1), evaluate(expression.right, sheet, depth + 1), (left, right) => {
    if (left.type === "error") return left;
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
  });

  type FormulaFunction = (
    args: readonly FormulaExpression[],
    sheet: string,
    depth: number,
  ) => EvaluationValue;

  const callIf: FormulaFunction = (args, sheet, depth) => {
      if (args.length < 2 || args.length > 3) return error("#VALUE!");
      const condition = logical(scalar(evaluate(args[0]!, sheet, depth + 1)));
      if (condition.type === "error") return condition;
      const branch = condition.value ? args[1]! : args[2];
      return branch === undefined ? boolean(false) : evaluate(branch, sheet, depth + 1);
  };

  const callIfError = (onlyNotAvailable: boolean): FormulaFunction => (args, sheet, depth) => {
    if (args.length !== 2) return error("#VALUE!");
    const value = scalar(evaluate(args[0]!, sheet, depth + 1));
    const catches = value.type === "error" && (!onlyNotAvailable || value.value === "#N/A");
    return catches ? scalar(evaluate(args[1]!, sheet, depth + 1)) : value;
  };

  const callIfs: FormulaFunction = (args, sheet, depth) => {
    if (args.length < 2 || args.length % 2 !== 0) return error("#VALUE!");
    for (let index = 0; index < args.length; index += 2) {
      const condition = logical(scalar(evaluate(args[index]!, sheet, depth + 1)));
      if (condition.type === "error") return condition;
      if (condition.value) return scalar(evaluate(args[index + 1]!, sheet, depth + 1));
    }
    return error("#N/A");
  };

  const callSwitch: FormulaFunction = (args, sheet, depth) => {
    if (args.length < 3) return error("#VALUE!");
    const selected = scalar(evaluate(args[0]!, sheet, depth + 1));
    if (selected.type === "error") return selected;
    const hasDefault = args.length % 2 === 0;
    const pairEnd = hasDefault ? args.length - 1 : args.length;
    for (let index = 1; index < pairEnd; index += 2) {
      const candidate = scalar(evaluate(args[index]!, sheet, depth + 1));
      if (candidate.type === "error") return candidate;
      if (compare(selected, candidate) === 0) {
        return scalar(evaluate(args[index + 1]!, sheet, depth + 1));
      }
    }
    return hasDefault ? scalar(evaluate(args.at(-1)!, sheet, depth + 1)) : error("#N/A");
  };

  const callConditionalAggregate = (name: "COUNTIF" | "SUMIF" | "AVERAGEIF"): FormulaFunction =>
    (args, sheet, depth) => {
      const validArgumentCount = name === "COUNTIF" ? args.length === 2 : args.length === 2 || args.length === 3;
      if (!validArgumentCount) return error("#VALUE!");
      const inspected = resolveRange(args[0]!, sheet, source, limits.maxRangeCells);
      if (isFormulaError(inspected)) return inspected;
      const criterionValue = scalar(evaluate(args[1]!, sheet, depth + 1));
      if (criterionValue.type === "error") return criterionValue;
      const criterion = compileCriterion(criterionValue);
      const resultStart = args[2] === undefined
        ? inspected
        : resolveReference(args[2], sheet, depth + 1);
      if ("type" in resultStart) return resultStart.type === "error" ? resultStart : error("#VALUE!");
      assertCorrespondingRange(resultStart, inspected.height, inspected.width, limits.maxRangeCells);

      let count = 0;
      let total = 0;
      for (let rowOffset = 0; rowOffset < inspected.height; rowOffset += 1) {
        for (let columnOffset = 0; columnOffset < inspected.width; columnOffset += 1) {
          operation();
          const inspectedValue = cellValue({
            sheet: inspected.sheet,
            row: inspected.firstRow + rowOffset,
            column: inspected.firstColumn + columnOffset,
          }, depth + 1, true);
          if (name === "AVERAGEIF" && inspectedValue.type === "boolean") continue;
          if (!matchesCriterion(inspectedValue, criterion)) continue;
          if (name === "COUNTIF") {
            count += 1;
            continue;
          }
          const resultAddress = correspondingAddress(resultStart, rowOffset, columnOffset);
          const resultValue = cellValue(resultAddress, depth + 1, true);
          if (resultValue.type === "error") return resultValue;
          if (resultValue.type !== "number") continue;
          count += 1;
          total += resultValue.value;
        }
      }
      if (name === "COUNTIF") return number(count);
      if (name === "AVERAGEIF") return count === 0 ? error("#DIV/0!") : finite(total / count);
      return finite(total);
    };

  const callMultiConditionalAggregate = (name: "COUNTIFS" | "SUMIFS" | "AVERAGEIFS"): FormulaFunction =>
    (args, sheet, depth) => {
      const countsOnly = name === "COUNTIFS";
      const firstCriteriaIndex = countsOnly ? 0 : 1;
      if (
        args.length < (countsOnly ? 2 : 3) ||
        (args.length - firstCriteriaIndex) % 2 !== 0
      ) return error("#VALUE!");

      const resultRange = resolveRange(args[0]!, sheet, source, limits.maxRangeCells);
      if (isFormulaError(resultRange)) return resultRange;
      const criteria: Array<{ readonly range: FormulaRangeGeometry; readonly criterion: FormulaCriterion }> = [];
      for (let index = firstCriteriaIndex; index < args.length; index += 2) {
        const range = resolveRange(args[index]!, sheet, source, limits.maxRangeCells);
        if (isFormulaError(range)) return range;
        if (range.height !== resultRange.height || range.width !== resultRange.width) return error("#VALUE!");
        const criterionValue = scalar(evaluate(args[index + 1]!, sheet, depth + 1));
        if (criterionValue.type === "error") return criterionValue;
        criteria.push(Object.freeze({ range, criterion: compileCriterion(criterionValue) }));
      }

      let count = 0;
      let total = 0;
      for (let rowOffset = 0; rowOffset < resultRange.height; rowOffset += 1) {
        for (let columnOffset = 0; columnOffset < resultRange.width; columnOffset += 1) {
          operation();
          let matches = true;
          for (const item of criteria) {
            const value = cellValue(correspondingAddress(item.range, rowOffset, columnOffset), depth + 1, true);
            if (!matchesCriterion(value, item.criterion)) {
              matches = false;
              break;
            }
          }
          if (!matches) continue;
          if (countsOnly) {
            count += 1;
            continue;
          }
          const resultValue = cellValue(correspondingAddress(resultRange, rowOffset, columnOffset), depth + 1, true);
          if (resultValue.type === "error") return resultValue;
          if (resultValue.type !== "number") continue;
          count += 1;
          total += resultValue.value;
        }
      }
      if (name === "COUNTIFS") return number(count);
      if (name === "AVERAGEIFS") return count === 0 ? error("#DIV/0!") : finite(total / count);
      return finite(total);
    };

  const callAggregate = (name: "SUM" | "COUNT" | "AVERAGE" | "MIN" | "MAX" | "AND" | "OR" | "XOR" | "NOT"): FormulaFunction =>
    (args, sheet, depth) => {
    const evaluated = args.map((argument): EvaluationValue => {
      if (argument.kind === "reference" && argument.whole) {
        const ref = resolveReference(argument, sheet, depth + 1);
        if ("type" in ref) return ref;
        const value = readReference(scanReference(ref), depth + 1);
        const rows = matrix(value);
        return {kind: "range", rows, values: rows.flat()};
      }
      return evaluate(argument, sheet, depth + 1);
    });
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
      case "XOR": return logicalAggregate(evaluated, false, true);
      case "NOT": {
        if (evaluated.length !== 1) return error("#VALUE!");
        const value = logical(scalar(evaluated[0]!));
        return value.type === "error" ? value : boolean(!value.value);
      }
      default: throw new EvaluationUnavailable("unsupported-function", `Function ${name} is not supported.`);
    }
    };

  const scalarArguments = (args: readonly FormulaExpression[], sheet: string, depth: number) =>
    args.map((argument) => scalar(evaluate(argument, sheet, depth + 1)));

  const callMath = (name: string): FormulaFunction => (args, sheet, depth) => {
    const aggregate = name === "PRODUCT";
    const evaluated = args.map((argument) => evaluate(argument, sheet, depth + 1));
    const firstError = flatten(evaluated).find((value) => value.type === "error");
    if (firstError?.type === "error") return firstError;
    if (aggregate) {
      if (args.length === 0) return error("#VALUE!");
      const values = numbersForAggregate(evaluated);
      return finite(values.reduce((product, value) => product * value, 1));
    }
    const values = evaluated.map(scalar);
    const expected = name === "ABS" || name === "INT" ? [1, 1] : name === "CEILING.MATH" || name === "FLOOR.MATH" ? [1, 3] : [2, 2];
    if (values.length < expected[0]! || values.length > expected[1]!) return error("#VALUE!");
    const numericValues: number[] = [];
    for (const value of values) {
      const converted = numeric(value);
      if (converted.type === "error") return converted;
      numericValues.push(converted.value);
    }
    const first = numericValues[0]!;
    switch (name) {
      case "ABS": return finite(Math.abs(first));
      case "INT": return finite(Math.floor(first));
      case "MOD": {
        const divisor = numericValues[1]!;
        return divisor === 0 ? error("#DIV/0!") : finite(first - divisor * Math.floor(first / divisor));
      }
      case "ROUND": return excelRound(first, numericValues[1]!, "nearest");
      case "ROUNDUP": return excelRound(first, numericValues[1]!, "away");
      case "ROUNDDOWN": return excelRound(first, numericValues[1]!, "toward");
      case "CEILING.MATH":
      case "FLOOR.MATH": {
        const significance = Math.abs(numericValues[1] ?? 1);
        const mode = numericValues[2] ?? 0;
        if (significance === 0) return number(0);
        return finite(mathMultiple(first, significance, mode !== 0, name === "CEILING.MATH"));
      }
      default: throw new EvaluationUnavailable("unsupported-function", `Function ${name} is not supported.`);
    }
  };

  const callSumProduct: FormulaFunction = (args, sheet, depth) => {
    if (args.length === 0) return error("#VALUE!");
    const matrices = args.map(argument => matrix(evaluate(argument, sheet, depth + 1)));
    const height = matrices[0]!.length, width = matrices[0]![0]!.length;
    if (matrices.some(rows => rows.length !== height || rows[0]!.length !== width)) return error("#VALUE!");
    const arrays = matrices.map(rows => rows.flat());
    const length = height * width;
    let total = 0;
    for (let index = 0; index < length; index += 1) {
      operation();
      let product = 1;
      for (const values of arrays) {
        const value = values[index]!;
        if (value.type === "error") return value;
        product *= value.type === "number" ? value.value : 0;
      }
      total += product;
    }
    return finite(total);
  };

  const callStatistic = (name: string): FormulaFunction => (args, sheet, depth) => {
    if (args.length === 0 || name === "COUNTBLANK" && args.length !== 1) return error("#VALUE!");
    const evaluated = args.map((argument) => evaluate(argument, sheet, depth + 1));
    if (name === "COUNTA" || name === "COUNTBLANK") {
      const values = flatten(evaluated);
      const count = values.filter((value) => name === "COUNTA"
        ? value.type !== "blank"
        : value.type === "blank" || value.type === "string" && value.value === "").length;
      return number(count);
    }
    const firstError = flatten(evaluated).find((value) => value.type === "error");
    if (firstError?.type === "error") return firstError;
    const values = numbersForAggregate(evaluated);
    if (name === "MEDIAN") {
      if (values.length === 0) return error("#NUM!");
      const sorted = [...values].sort((left, right) => left - right);
      const middle = Math.floor(sorted.length / 2);
      return finite(sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!);
    }
    const sample = name.endsWith(".S");
    if (values.length < (sample ? 2 : 1)) return error("#DIV/0!");
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - (sample ? 1 : 0));
    return finite(name.startsWith("STDEV") ? Math.sqrt(variance) : variance);
  };

  const callTypePredicate = (name: string): FormulaFunction => (args, sheet, depth) => {
    if (args.length !== 1) return error("#VALUE!");
    const value = scalar(evaluate(args[0]!, sheet, depth + 1));
    switch (name) {
      case "ISBLANK": return boolean(value.type === "blank");
      case "ISNUMBER": return boolean(value.type === "number");
      case "ISTEXT": return boolean(value.type === "string");
      case "ISLOGICAL": return boolean(value.type === "boolean");
      case "ISERROR": return boolean(value.type === "error");
      case "ISERR": return boolean(value.type === "error" && value.value !== "#N/A");
      case "ISNA": return boolean(value.type === "error" && value.value === "#N/A");
      default: throw new EvaluationUnavailable("unsupported-function", `Function ${name} is not supported.`);
    }
  };

  const callText = (name: string): FormulaFunction => (args, sheet, depth) => {
    const evaluated = scalarArguments(args, sheet, depth);
    const firstError = evaluated.find((value) => value.type === "error");
    if (firstError?.type === "error") return firstError;
    const arity = textFunctionArity(name);
    if (args.length < arity[0] || args.length > arity[1]) return error("#VALUE!");
    const sourceText = evaluated[0] === undefined ? "" : text(evaluated[0]);
    switch (name) {
      case "LEN": return number(sourceText.length);
      case "LOWER": return boundedString(sourceText.toLocaleLowerCase("en-US"));
      case "UPPER": return boundedString(sourceText.toLocaleUpperCase("en-US"));
      case "PROPER": return boundedString(properCase(sourceText));
      case "TRIM": return boundedString(sourceText.trim().replace(/ +/g, " "));
      case "EXACT": return boolean(sourceText === text(evaluated[1]!));
      case "LEFT":
      case "RIGHT": {
        const count = evaluated[1] === undefined ? number(1) : numeric(evaluated[1]);
        if (count.type === "error") return count;
        const size = Math.trunc(count.value);
        if (size < 0) return error("#VALUE!");
        return boundedString(name === "LEFT" ? sourceText.slice(0, size) : sourceText.slice(Math.max(0, sourceText.length - size)));
      }
      case "MID": {
        const start = numeric(evaluated[1]!);
        const count = numeric(evaluated[2]!);
        if (start.type === "error") return start;
        if (count.type === "error") return count;
        const offset = Math.trunc(start.value);
        const size = Math.trunc(count.value);
        return offset < 1 || size < 0 ? error("#VALUE!") : boundedString(sourceText.slice(offset - 1, offset - 1 + size));
      }
      case "FIND":
      case "SEARCH": {
        const needle = sourceText;
        const haystack = text(evaluated[1]!);
        const startValue = evaluated[2] === undefined ? number(1) : numeric(evaluated[2]);
        if (startValue.type === "error") return startValue;
        const start = Math.trunc(startValue.value);
        if (start < 1 || start > haystack.length + 1) return error("#VALUE!");
        const index = name === "FIND"
          ? haystack.indexOf(needle, start - 1)
          : haystack.toLocaleLowerCase("en-US").indexOf(needle.toLocaleLowerCase("en-US"), start - 1);
        return index < 0 ? error("#VALUE!") : number(index + 1);
      }
      case "SUBSTITUTE": {
        const oldText = text(evaluated[1]!);
        const replacement = text(evaluated[2]!);
        if (oldText === "") return boundedString(sourceText);
        if (evaluated[3] === undefined) return boundedString(sourceText.split(oldText).join(replacement));
        const occurrence = numeric(evaluated[3]);
        if (occurrence.type === "error") return occurrence;
        const selected = Math.trunc(occurrence.value);
        if (selected < 1) return error("#VALUE!");
        let seen = 0;
        let cursor = 0;
        while (true) {
          operation();
          const found = sourceText.indexOf(oldText, cursor);
          if (found < 0) return boundedString(sourceText);
          seen += 1;
          if (seen === selected) return boundedString(sourceText.slice(0, found) + replacement + sourceText.slice(found + oldText.length));
          cursor = found + oldText.length;
        }
      }
      default: throw new EvaluationUnavailable("unsupported-function", `Function ${name} is not supported.`);
    }
  };

  const callConcatenate = (join: boolean): FormulaFunction => (args, sheet, depth) => {
    if (join && args.length < 3 || !join && args.length === 0) return error("#VALUE!");
    const delimiter = join ? scalar(evaluate(args[0]!, sheet, depth + 1)) : string("");
    const ignoreEmpty = join ? logical(scalar(evaluate(args[1]!, sheet, depth + 1))) : boolean(false);
    if (delimiter.type === "error") return delimiter;
    if (ignoreEmpty.type === "error") return ignoreEmpty;
    const values = flatten(args.slice(join ? 2 : 0).map((argument) => evaluate(argument, sheet, depth + 1)));
    const firstError = values.find((value) => value.type === "error");
    if (firstError?.type === "error") return firstError;
    const texts = values.map(text).filter((value) => !ignoreEmpty.value || value !== "");
    return boundedString(texts.join(text(delimiter)));
  };

  const callDate = (name: string): FormulaFunction => (args, sheet, depth) => {
    const evaluated = scalarArguments(args, sheet, depth);
    const firstError = evaluated.find((value) => value.type === "error");
    if (firstError?.type === "error") return firstError;
    const converted = evaluated.map(numeric);
    const numericError = converted.find((value) => value.type === "error");
    const numbers = converted.map((value) => value.type === "number" ? value.value : Number.NaN);

    if (name === "DATEVALUE") {
      if (args.length !== 1) return error("#VALUE!");
      const parsed = parseInvariantDate(text(evaluated[0]!));
      return parsed === undefined ? error("#VALUE!") : datePartsToSerial(parsed.year, parsed.month, parsed.day, dateSystem);
    }
    if (numericError?.type === "error") return numericError;
    if ((name === "DATE" && args.length !== 3) || (["YEAR", "MONTH", "DAY"].includes(name) && args.length !== 1)) {
      return error("#VALUE!");
    }
    if (name === "DATE") {
      let year = Math.trunc(numbers[0]!);
      if (year >= 0 && year < 1900) year += 1900;
      if (year < 0 || year > 9999) return error("#NUM!");
      return normalizedDateToSerial(year, Math.trunc(numbers[1]!), Math.trunc(numbers[2]!), dateSystem);
    }
    if (name === "YEAR" || name === "MONTH" || name === "DAY") {
      const parts = serialToDateParts(numbers[0]!, dateSystem);
      if (parts === undefined) return error("#NUM!");
      return number(name === "YEAR" ? parts.year : name === "MONTH" ? parts.month : parts.day);
    }
    if (name === "DAYS") {
      if (args.length !== 2) return error("#VALUE!");
      return finite(Math.trunc(numbers[0]!) - Math.trunc(numbers[1]!));
    }
    if (name === "EDATE" || name === "EOMONTH") {
      if (args.length !== 2) return error("#VALUE!");
      const parts = serialToDateParts(numbers[0]!, dateSystem);
      if (parts === undefined || parts.syntheticLeapDay) return error("#NUM!");
      const months = Math.trunc(numbers[1]!);
      const shifted = shiftMonth(parts.year, parts.month, months + (name === "EOMONTH" ? 1 : 0));
      return name === "EOMONTH"
        ? normalizedDateToSerial(shifted.year, shifted.month, 0, dateSystem)
        : normalizedDateToSerial(shifted.year, shifted.month, Math.min(parts.day, daysInMonth(shifted.year, shifted.month)), dateSystem);
    }
    if (name === "WEEKDAY") {
      if (args.length < 1 || args.length > 2) return error("#VALUE!");
      const serial = Math.trunc(numbers[0]!);
      const returnType = Math.trunc(numbers[1] ?? 1);
      const sundayZero = excelSundayZero(serial, dateSystem);
      if (returnType === 1) return number(sundayZero + 1);
      if (returnType === 2) return number((sundayZero + 6) % 7 + 1);
      if (returnType === 3) return number((sundayZero + 6) % 7);
      if (returnType >= 11 && returnType <= 17) return number((sundayZero + 7 - (returnType - 10) % 7) % 7 + 1);
      return error("#NUM!");
    }
    return error("#VALUE!");
  };

  const callBusinessDate = (name: "NETWORKDAYS" | "WORKDAY"): FormulaFunction => (args, sheet, depth) => {
    if (args.length < 2 || args.length > 3) return error("#VALUE!");
    const first = numeric(scalar(evaluate(args[0]!, sheet, depth + 1)));
    const second = numeric(scalar(evaluate(args[1]!, sheet, depth + 1)));
    if (first.type === "error") return first;
    if (second.type === "error") return second;
    const holidayValues = args[2] === undefined ? [] : flatten([evaluate(args[2], sheet, depth + 1)]);
    const holidayError = holidayValues.find((value) => value.type === "error");
    if (holidayError?.type === "error") return holidayError;
    const holidays = new Set(holidayValues.flatMap((value) => value.type === "number" ? [Math.trunc(value.value)] : []));
    const businessDay = (serial: number) => {
      const sundayZero = excelSundayZero(serial, dateSystem);
      return sundayZero !== 0 && sundayZero !== 6 && !holidays.has(serial);
    };

    if (name === "NETWORKDAYS") {
      const start = Math.trunc(first.value);
      const end = Math.trunc(second.value);
      const direction = start <= end ? 1 : -1;
      let count = 0;
      for (let serial = start; ; serial += direction) {
        operation();
        if (businessDay(serial)) count += direction;
        if (serial === end) break;
      }
      return number(count);
    }

    let serial = Math.trunc(first.value);
    let remaining = Math.abs(Math.trunc(second.value));
    const direction = second.value < 0 ? -1 : 1;
    while (remaining > 0) {
      operation();
      serial += direction;
      if (businessDay(serial)) remaining -= 1;
    }
    return number(serial);
  };

  const readRange = (range: FormulaRangeGeometry, depth: number): FormulaScalarValue[] => {
    const values: FormulaScalarValue[] = [];
    for (let row = 0; row < range.height; row += 1) {
      for (let column = 0; column < range.width; column += 1) {
        operation();
        values.push(cellValue(correspondingAddress(range, row, column), depth + 1, true));
      }
    }
    return values;
  };

  const findLookupIndex = (
    lookup: FormulaScalarValue,
    values: readonly FormulaScalarValue[],
    matchMode: number,
    searchMode: number,
  ): number | undefined => {
    const indexes = Array.from({ length: values.length }, (_, index) => index);
    if (searchMode === -1 || searchMode === -2) indexes.reverse();
    const wildcard = matchMode === 2 && lookup.type === "string" ? tokenizeWildcard(lookup.value) : undefined;
    for (const index of indexes) {
      operation();
      const candidate = values[index]!;
      if (candidate.type === "error") continue;
      const exact = wildcard === undefined
        ? lookup.type === candidate.type && compare(lookup, candidate) === 0
        : candidate.type === "string" && wildcardMatches(wildcard, candidate.value);
      if (exact) return index;
    }
    if (matchMode !== -1 && matchMode !== 1) return undefined;
    let best: { readonly index: number; readonly distance: number } | undefined;
    for (const index of indexes) {
      operation();
      const candidate = values[index]!;
      if (candidate.type !== lookup.type || candidate.type === "error" || candidate.type === "blank") continue;
      const comparison = compare(candidate, lookup);
      if (matchMode === -1 && comparison > 0 || matchMode === 1 && comparison < 0) continue;
      const distance = Math.abs(comparison);
      if (best === undefined || distance < best.distance) best = { index, distance };
    }
    return best?.index;
  };

  const callChoose: FormulaFunction = (args, sheet, depth) => {
    if (args.length < 2) return error("#VALUE!");
    const selected = numeric(scalar(evaluate(args[0]!, sheet, depth + 1)));
    if (selected.type === "error") return selected;
    const index = Math.trunc(selected.value);
    return index < 1 || index >= args.length ? error("#VALUE!") : scalar(evaluate(args[index]!, sheet, depth + 1));
  };

  const callIndex: FormulaFunction = (args, sheet, depth) => {
    if (args.length < 2 || args.length > 3) return error("#VALUE!");
    const data = matrix(evaluate(args[0]!, sheet, depth + 1));
    const rowValue = numeric(scalar(evaluate(args[1]!, sheet, depth + 1)));
    const columnValue = args[2] === undefined ? undefined : numeric(scalar(evaluate(args[2], sheet, depth + 1)));
    if (rowValue.type === "error") return rowValue;
    if (columnValue?.type === "error") return columnValue;
    const row = data.length === 1 && columnValue === undefined ? 1 : Math.trunc(rowValue.value);
    const column = data.length === 1 && columnValue === undefined ? Math.trunc(rowValue.value) : Math.trunc(columnValue?.value ?? 1);
    if (row < 0 || row > data.length || column < 0 || column > data[0]!.length) return error("#REF!");
    const rows = (row ? [data[row - 1]!] : data).map(values => column ? [values[column - 1]!] : values);
    return rows.length === 1 && rows[0]!.length === 1 ? rows[0]![0]! : {kind: "array", rows};
  };

  const callMatch = (extended: boolean): FormulaFunction => (args, sheet, depth) => {
    const maximum = extended ? 4 : 3;
    if (args.length < 2 || args.length > maximum) return error("#VALUE!");
    const lookup = scalar(evaluate(args[0]!, sheet, depth + 1));
    if (lookup.type === "error") return lookup;
    const range = resolveRange(args[1]!, sheet, source, limits.maxRangeCells);
    if (isFormulaError(range)) return range;
    if (range.height > 1 && range.width > 1) return error("#N/A");
    const modeValue = args[2] === undefined ? number(extended ? 0 : 1) : numeric(scalar(evaluate(args[2], sheet, depth + 1)));
    const searchValue = !extended || args[3] === undefined ? number(1) : numeric(scalar(evaluate(args[3], sheet, depth + 1)));
    if (modeValue.type === "error") return modeValue;
    if (searchValue.type === "error") return searchValue;
    const matchMode = Math.trunc(modeValue.value);
    const searchMode = Math.trunc(searchValue.value);
    if (!(extended ? [-1, 0, 1, 2].includes(matchMode) : [-1, 0, 1].includes(matchMode))) return error("#N/A");
    if (![1, -1, 2, -2].includes(searchMode)) return error("#VALUE!");
    const lookupMode = extended ? matchMode : matchMode === 1 ? -1 : matchMode === -1 ? 1 : 0;
    const index = findLookupIndex(lookup, readRange(range, depth), lookupMode, searchMode);
    return index === undefined ? error("#N/A") : number(index + 1);
  };

  const callXlookup: FormulaFunction = (args, sheet, depth) => {
    if (args.length < 3 || args.length > 6) return error("#VALUE!");
    const lookup = scalar(evaluate(args[0]!, sheet, depth + 1));
    if (lookup.type === "error") return lookup;
    const lookupRange = resolveRange(args[1]!, sheet, source, limits.maxRangeCells);
    const resultRange = resolveRange(args[2]!, sheet, source, limits.maxRangeCells);
    if (isFormulaError(lookupRange)) return lookupRange;
    if (isFormulaError(resultRange)) return resultRange;
    if (lookupRange.height > 1 && lookupRange.width > 1 || (lookupRange.width === 1 ? lookupRange.height !== resultRange.height : lookupRange.width !== resultRange.width)) return error("#VALUE!");
    const match = args[4] === undefined ? number(0) : numeric(scalar(evaluate(args[4], sheet, depth + 1)));
    const search = args[5] === undefined ? number(1) : numeric(scalar(evaluate(args[5], sheet, depth + 1)));
    if (match.type === "error") return match;
    if (search.type === "error") return search;
    const matchMode = Math.trunc(match.value);
    const searchMode = Math.trunc(search.value);
    if (![-1, 0, 1, 2].includes(matchMode) || ![1, -1, 2, -2].includes(searchMode)) return error("#VALUE!");
    const index = findLookupIndex(lookup, readRange(lookupRange, depth), matchMode, searchMode);
    if (index === undefined) return args[3] === undefined ? error("#N/A") : scalar(evaluate(args[3], sheet, depth + 1));
    return readReference({...resultRange, firstRow: resultRange.firstRow + (lookupRange.width === 1 ? index : 0), firstColumn: resultRange.firstColumn + (lookupRange.width === 1 ? 0 : index), height: lookupRange.width === 1 ? 1 : resultRange.height, width: lookupRange.width === 1 ? resultRange.width : 1}, depth + 1);
  };

  const callTableLookup = (horizontal: boolean): FormulaFunction => (args, sheet, depth) => {
    if (args.length < 3 || args.length > 4) return error("#VALUE!");
    const lookup = scalar(evaluate(args[0]!, sheet, depth + 1));
    if (lookup.type === "error") return lookup;
    const table = resolveRange(args[1]!, sheet, source, limits.maxRangeCells);
    if (isFormulaError(table)) return table;
    const selected = numeric(scalar(evaluate(args[2]!, sheet, depth + 1)));
    const approximate = args[3] === undefined ? boolean(true) : logical(scalar(evaluate(args[3], sheet, depth + 1)));
    if (selected.type === "error") return selected;
    if (approximate.type === "error") return approximate;
    const selectedIndex = Math.trunc(selected.value);
    const selectedLimit = horizontal ? table.height : table.width;
    if (selectedIndex < 1 || selectedIndex > selectedLimit) return error("#REF!");
    const lookupLength = horizontal ? table.width : table.height;
    const lookupValues = Array.from({ length: lookupLength }, (_, index) => cellValue(
      correspondingAddress(table, horizontal ? 0 : index, horizontal ? index : 0), depth + 1, true,
    ));
    const index = findLookupIndex(lookup, lookupValues, approximate.value ? -1 : 0, 1);
    if (index === undefined) return error("#N/A");
    return cellValue(correspondingAddress(table, horizontal ? selectedIndex - 1 : index, horizontal ? index : selectedIndex - 1), depth + 1, true);
  };

  type AggregateCell = {
    readonly address: FormulaCellAddress;
    readonly input: FormulaCellInput | undefined;
    readonly value: FormulaScalarValue;
  };

  const aggregateCells = (
    args: readonly FormulaExpression[],
    sheet: string,
    depth: number,
    policy: { readonly ignoreHidden: boolean; readonly ignoreNested: boolean; readonly ignoreErrors: boolean },
  ): FormulaScalarValue[] | Extract<FormulaScalarValue, { type: "error" }> => {
    const cells: AggregateCell[] = [];
    for (const argument of args) {
      const range = resolveRange(argument, sheet, source, limits.maxRangeCells);
      if (isFormulaError(range)) return range;
      for (let rowOffset = 0; rowOffset < range.height; rowOffset += 1) {
        for (let columnOffset = 0; columnOffset < range.width; columnOffset += 1) {
          operation();
          const address = correspondingAddress(range, rowOffset, columnOffset);
          const visibility = source.rowVisibility?.(address.sheet, address.row);
          if (visibility?.determinate === false) {
            throw new EvaluationUnavailable("unavailable-dependency", "Filtered row visibility cannot be determined safely.");
          }
          if (visibility?.filteredOut === true || policy.ignoreHidden && visibility?.manuallyHidden === true) continue;
          const input = readCell(source, address);
          if (policy.ignoreNested && input?.formula !== undefined) {
            const key = addressKey(address);
            let nested = aggregateFormulaCells.get(key);
            if (nested === undefined) {
              nested = formulaContainsAggregate(input.formula);
              aggregateFormulaCells.set(key, nested);
            }
            if (nested) continue;
          }
          const value = cellValue(address, depth + 1, true);
          if (policy.ignoreErrors && value.type === "error") continue;
          cells.push(Object.freeze({ address, input, value }));
        }
      }
    }
    return cells.map((cell) => cell.value);
  };

  const reduceAggregate = (functionNumber: number, values: readonly FormulaScalarValue[], k?: number): FormulaScalarValue => {
    const numericValues = values.flatMap((value) => value.type === "number" ? [value.value] : []);
    const firstError = values.find((value) => value.type === "error");
    if (functionNumber !== 2 && functionNumber !== 3 && firstError?.type === "error") return firstError;
    switch (functionNumber) {
      case 1: return numericValues.length === 0 ? error("#DIV/0!") : finite(sumNumbers(numericValues) / numericValues.length);
      case 2: return number(numericValues.length);
      case 3: return number(values.filter((value) => value.type !== "blank").length);
      case 4: return finite(numericValues.length === 0 ? 0 : Math.max(...numericValues));
      case 5: return finite(numericValues.length === 0 ? 0 : Math.min(...numericValues));
      case 6: return finite(numericValues.length === 0 ? 0 : numericValues.reduce((product, value) => product * value, 1));
      case 7: return varianceAggregate(numericValues, true, true);
      case 8: return varianceAggregate(numericValues, false, true);
      case 9: return finite(sumNumbers(numericValues));
      case 10: return varianceAggregate(numericValues, true, false);
      case 11: return varianceAggregate(numericValues, false, false);
      case 12: return medianAggregate(numericValues);
      case 13: return modeAggregate(numericValues);
      case 14: return rankedAggregate(numericValues, k, true);
      case 15: return rankedAggregate(numericValues, k, false);
      case 16: return percentileAggregate(numericValues, k, true);
      case 17: return percentileAggregate(numericValues, k === undefined ? undefined : k / 4, true, true);
      case 18: return percentileAggregate(numericValues, k, false);
      case 19: return percentileAggregate(numericValues, k === undefined ? undefined : k / 4, false, true);
      default: return error("#NUM!");
    }
  };

  const callSubtotal: FormulaFunction = (args, sheet, depth) => {
    if (args.length < 2 || args.length > 255) return error("#VALUE!");
    const selected = numeric(scalar(evaluate(args[0]!, sheet, depth + 1)));
    if (selected.type === "error") return selected;
    const raw = Math.trunc(selected.value);
    const functionNumber = raw >= 101 && raw <= 111 ? raw - 100 : raw;
    if (functionNumber < 1 || functionNumber > 11 || raw !== functionNumber && raw !== functionNumber + 100) return error("#NUM!");
    const values = aggregateCells(args.slice(1), sheet, depth, {
      ignoreHidden: raw >= 101,
      ignoreNested: true,
      ignoreErrors: false,
    });
    return isFormulaError(values) ? values : reduceAggregate(functionNumber, values);
  };

  const callAggregateFunction: FormulaFunction = (args, sheet, depth) => {
    if (args.length < 3 || args.length > 253) return error("#VALUE!");
    const selected = numeric(scalar(evaluate(args[0]!, sheet, depth + 1)));
    const options = numeric(scalar(evaluate(args[1]!, sheet, depth + 1)));
    if (selected.type === "error") return selected;
    if (options.type === "error") return options;
    const functionNumber = Math.trunc(selected.value);
    const option = Math.trunc(options.value);
    if (functionNumber < 1 || functionNumber > 19 || option < 0 || option > 7) return error("#NUM!");
    const needsK = functionNumber >= 14;
    if (needsK && args.length !== 4) return error("#VALUE!");
    const kValue = !needsK ? undefined : numeric(scalar(evaluate(args[3]!, sheet, depth + 1)));
    if (kValue?.type === "error") return kValue;
    const values = aggregateCells(needsK ? [args[2]!] : args.slice(2), sheet, depth, {
      ignoreHidden: [1, 3, 5, 7].includes(option),
      ignoreNested: option <= 3,
      ignoreErrors: [2, 3, 6, 7].includes(option),
    });
    return isFormulaError(values) ? values : reduceAggregate(functionNumber, values, kValue?.value);
  };

  const functions = new Map<string, FormulaFunction>([
    ["IF", callIf],
    ["IFERROR", callIfError(false)],
    ["IFNA", callIfError(true)],
    ["IFS", callIfs],
    ["SWITCH", callSwitch],
    ["COUNTIF", callConditionalAggregate("COUNTIF")],
    ["SUMIF", callConditionalAggregate("SUMIF")],
    ["AVERAGEIF", callConditionalAggregate("AVERAGEIF")],
    ["COUNTIFS", callMultiConditionalAggregate("COUNTIFS")],
    ["SUMIFS", callMultiConditionalAggregate("SUMIFS")],
    ["AVERAGEIFS", callMultiConditionalAggregate("AVERAGEIFS")],
    ...(["ABS", "ROUND", "ROUNDUP", "ROUNDDOWN", "INT", "MOD", "PRODUCT", "CEILING.MATH", "FLOOR.MATH"] as const)
      .map((name) => [name, callMath(name)] as const),
    ["SUMPRODUCT", callSumProduct],
    ...(["COUNTA", "COUNTBLANK", "MEDIAN", "STDEV.S", "STDEV.P", "VAR.S", "VAR.P"] as const)
      .map((name) => [name, callStatistic(name)] as const),
    ...(["ISBLANK", "ISNUMBER", "ISTEXT", "ISLOGICAL", "ISERROR", "ISERR", "ISNA"] as const)
      .map((name) => [name, callTypePredicate(name)] as const),
    ...(["LEN", "LEFT", "RIGHT", "MID", "TRIM", "UPPER", "LOWER", "PROPER", "SUBSTITUTE", "FIND", "SEARCH", "EXACT"] as const)
      .map((name) => [name, callText(name)] as const),
    ["CONCAT", callConcatenate(false)],
    ["CONCATENATE", callConcatenate(false)],
    ["TEXTJOIN", callConcatenate(true)],
    ...(["DATE", "DATEVALUE", "YEAR", "MONTH", "DAY", "DAYS", "EDATE", "EOMONTH", "WEEKDAY"] as const)
      .map((name) => [name, callDate(name)] as const),
    ...(["NETWORKDAYS", "WORKDAY"] as const).map((name) => [name, callBusinessDate(name)] as const),
    ["CHOOSE", callChoose],
    ["INDEX", callIndex],
    ["MATCH", callMatch(false)],
    ["XMATCH", callMatch(true)],
    ["XLOOKUP", callXlookup],
    ["VLOOKUP", callTableLookup(false)],
    ["HLOOKUP", callTableLookup(true)],
    ["SUBTOTAL", callSubtotal],
    ["AGGREGATE", callAggregateFunction],
    ...(["SUM", "COUNT", "AVERAGE", "MIN", "MAX", "AND", "OR", "XOR", "NOT"] as const)
      .map((name) => [name, callAggregate(name)] as const),
  ]);

  function resolveRange(expression: FormulaExpression, sheet: string, _source: FormulaWorkbookSource, max: number): FunctionReference | Extract<FormulaScalarValue, {type: "error"}> {
    const ref = resolveReference(expression, sheet, 0);
    if ("type" in ref) return ref.type === "error" ? ref : error("#VALUE!");
    assertRangeSize(ref.height, ref.width, max);
    return ref;
  }

  function assertArray(height: number, width: number): void {
    if (!Number.isSafeInteger(height) || !Number.isSafeInteger(width) || height < 1 || width < 1 || height * width > limits.maxArrayCells) throw new EvaluationUnavailable("evaluation-limit", "Array exceeds the calculation limit.");
  }

  function scanReference(ref: FunctionReference): FunctionReference {
    const used = usedReference(ref, source);
    let height = used.height, width = used.width;
    for (const [key, array] of arrays) {
      operation();
      const [sheet, row, column] = key.split("\u0000");
      if (sheet !== ref.sheet) continue;
      if (ref.height === MAX_SPREADSHEET_ROW) height = Math.max(height, Number(row) + array.rows.length - 1);
      if (ref.width === MAX_SPREADSHEET_COLUMN) width = Math.max(width, Number(column) + array.rows[0]!.length - 1);
    }
    return {...ref, height, width};
  }

  function mapValues(left: EvaluationValue, right: EvaluationValue, fn: (a: FormulaScalarValue, b: FormulaScalarValue) => FormulaScalarValue): EvaluationValue {
    const scalarLike = (value: EvaluationValue) => !("kind" in value) || value.kind === "range" && value.rows.length === 1 && value.rows[0]?.length === 1;
    if (scalarLike(left) && scalarLike(right)) return fn(scalar(left), scalar(right));
    const a = matrix(left), b = matrix(right);
    const height = Math.max(a.length, b.length), width = Math.max(a[0]?.length ?? 0, b[0]?.length ?? 0);
    assertArray(height, width);
    if ((a.length !== 1 && a.length !== height) || (b.length !== 1 && b.length !== height) || (a[0]!.length !== 1 && a[0]!.length !== width) || (b[0]!.length !== 1 && b[0]!.length !== width)) return error("#VALUE!");
    return {kind: "array", rows: Array.from({length: height}, (_, r) => Array.from({length: width}, (_, c) => {
      operation();
      return fn(a[a.length === 1 ? 0 : r]![a[0]!.length === 1 ? 0 : c]!, b[b.length === 1 ? 0 : r]![b[0]!.length === 1 ? 0 : c]!);
    }))};
  }

  function readReference(ref: FunctionReference, depth: number): FunctionValue {
    if (ref.height < 1 || ref.width < 1) return error("#REF!");
    assertArray(ref.height, ref.width);
    if (!Number.isSafeInteger(ref.firstRow) || !Number.isSafeInteger(ref.firstColumn) || ref.firstRow < 1 || ref.firstColumn < 1 || ref.firstRow + ref.height - 1 > MAX_SPREADSHEET_ROW || ref.firstColumn + ref.width - 1 > MAX_SPREADSHEET_COLUMN) return error("#REF!");
    const rows = Array.from({length: ref.height}, (_, r) => Array.from({length: ref.width}, (_, c) => cellValue(correspondingAddress(ref, r, c), depth + 1, true)));
    return ref.height === 1 && ref.width === 1 ? rows[0]![0]! : {kind: "array", rows};
  }

  function checkedReference(ref: FunctionReference): FunctionReference | FormulaScalarValue {
    if (![ref.firstRow, ref.firstColumn, ref.height, ref.width].every(value => Number.isSafeInteger(value) && value > 0) || ref.firstRow + ref.height - 1 > MAX_SPREADSHEET_ROW || ref.firstColumn + ref.width - 1 > MAX_SPREADSHEET_COLUMN) return error("#REF!");
    return ref;
  }

  function resolveReference(expression: FormulaExpression, sheet: string, depth: number): FunctionReference | FormulaScalarValue {
    operation();
    if (depth > limits.maxEvaluationDepth) throw new EvaluationUnavailable("evaluation-limit", "Reference depth exceeded.");
    if (expression.kind === "spill") {
      const base = resolveReference(expression.operand, sheet, depth + 1);
      if ("type" in base) return base;
      const address = {sheet: base.sheet, row: base.firstRow, column: base.firstColumn};
      cellValue(address, depth + 1, true);
      const array = arrays.get(addressKey(address));
      return array ? {...base, height: array.rows.length, width: array.rows[0]!.length} : error("#REF!");
    }
    if (expression.kind === "name") {
      const named = source.resolveName?.(expression.name, activeAddress);
      return named === undefined ? error("#NAME?") : "kind" in named ? resolveReference(named, sheet, depth + 1) : checkedReference(named);
    }
    if (expression.kind === "function") {
      const name = normalizeFunctionName(expression.name), args = expression.arguments;
      const n = (index: number, fallback: number) => args[index] === undefined || args[index]!.kind === "omitted" ? number(fallback) : numeric(scalar(evaluate(args[index]!, sheet, depth + 1)));
      if (name === "INDIRECT" && args.length >= 1 && args.length <= 2) {
        const value = scalar(evaluate(args[0]!, sheet, depth + 1));
        if (value.type === "error") return value;
        const styleValue = args[1] === undefined ? {kind: "omitted"} as const : evaluate(args[1], sheet, depth + 1);
        const style = "kind" in styleValue && styleValue.kind === "omitted" ? boolean(true) : logical(scalar(styleValue));
        if (style.type === "error") return style;
        if (!style.value) return error("#REF!");
        try { return resolveReference(parseFormula(text(value)).expression, sheet, depth + 1); } catch (cause) { if (cause instanceof FormulaParseError) return error("#REF!"); throw cause; }
      }
      if ((name === "OFFSET" && args.length >= 3 && args.length <= 5) || (name === "INDEX" && args.length >= 2 && args.length <= 3)) {
        const base = resolveReference(args[0]!, sheet, depth + 1);
        if ("type" in base) return base;
        const row = n(1, 0), col = n(2, name === "INDEX" ? 1 : 0);
        if (row.type === "error") return row;
        if (col.type === "error") return col;
        const r = Math.trunc(row.value), c = Math.trunc(col.value);
        if (name === "OFFSET") {
          const h = n(3, base.height), w = n(4, base.width);
          if (h.type === "error") return h;
          if (w.type === "error") return w;
          return checkedReference({...base, firstRow: base.firstRow + r, firstColumn: base.firstColumn + c, height: Math.trunc(h.value), width: Math.trunc(w.value)});
        }
        const rr = base.height === 1 && args[2] === undefined ? 1 : r;
        const cc = base.height === 1 && args[2] === undefined ? r : c;
        if (rr < 0 || cc < 0 || rr > base.height || cc > base.width) return error("#REF!");
        return {...base, firstRow: base.firstRow + (rr ? rr - 1 : 0), firstColumn: base.firstColumn + (cc ? cc - 1 : 0), height: rr ? 1 : base.height, width: cc ? 1 : base.width};
      }
    }
    const ref = referenceGeometry(expression, sheet, source);
    return "type" in ref ? ref : checkedReference(ref);
  }

  function context(sheet: string, depth: number): FunctionContext {
    const capturedAddress = activeAddress, capturedBindings = new Map(bindings);
    const scoped = <T>(action: () => T, additions?: ReadonlyMap<string, FunctionValue>): T => {
      const priorAddress = activeAddress, priorBindings = bindings;
      activeAddress = capturedAddress;
      bindings = new Map([...capturedBindings, ...[...(additions ?? [])].map(([key, value]) => [normalizeBindingName(key), value] as const)]);
      try { return action(); } finally { activeAddress = priorAddress; bindings = priorBindings; }
    };
    return {
      address: capturedAddress, source, dateSystem, maxArrayCells: limits.maxArrayCells, services: options.services,
      evaluate: expression => scoped(() => toFunction(evaluate(expression, sheet, depth + 1))),
      withBindings: (additions, expression) => scoped(() => toFunction(evaluate(expression, sheet, depth + 1)), additions),
      call: (name, args) => scoped(() => toFunction(call(name.toUpperCase(), args.map(value => ({kind: "value", value, start: 0, end: 0})), sheet, depth + 1))),
      reference: expression => scoped(() => resolveReference(expression, sheet, depth + 1)),
      readReference: ref => scoped(() => readReference(ref, depth + 1)),
      cell: address => readCell(source, address), operation,
      now: () => new Date(capturedNow.getTime()), random: options.random ?? Math.random,
      unavailable: message => { throw new EvaluationUnavailable("unavailable-dependency", message); },
    };
  }

  const call = (name: string, args: readonly FormulaExpression[], sheet: string, depth: number): EvaluationValue => {
    operation();
    if (depth > limits.maxEvaluationDepth) throw new EvaluationUnavailable("evaluation-limit", "Function evaluation depth exceeded.");
    const normalized = normalizeFunctionName(name);
    if (normalized === "PY" && (publicExpression?.kind !== "function" || normalizeFunctionName(publicExpression.name) !== "PY" || publicExpression.arguments !== args)) throw new EvaluationUnavailable("unsupported-function", "PY must be a standalone public formula.");
    if (normalized === "PY" && args[0]?.kind !== "string") throw new EvaluationUnavailable("unavailable-dependency", "OOXML Python script indices require explicit script resolution; only public literal code syntax can be passed to a host.");
    const named = source.resolveName?.(name, activeAddress);
    const bound = bindings.get(normalizeBindingName(normalized)) ?? (named && "kind" in named ? toFunction(evaluate(named, sheet, depth + 1)) : undefined);
    if (bound !== undefined) return "kind" in bound && bound.kind === "lambda" ? bound.invoke(args.map(arg => toFunction(evaluate(arg, sheet, depth + 1)))) : error("#VALUE!");
    for (const registry of [...registries].reverse()) {
      const handler = registry.get(normalized);
      if (handler !== undefined) {
        const result = handler(args, context(sheet, depth));
        return normalized === "OFFSET" || normalized === "INDIRECT" ? referenceResult(result) : result;
      }
    }
    if (["OFFSET", "INDIRECT", "INDEX"].includes(normalized) && args[0]?.kind !== "array" && args[0]?.kind !== "value") {
      const ref = resolveReference({kind: "function", name: normalized, arguments: args, start: 0, end: 0}, sheet, depth + 1);
      if (!("type" in ref)) return referenceResult(readReference(ref, depth + 1));
      if (normalized !== "INDEX") return ref;
    }
    if (normalized === "TRUE" || normalized === "FALSE") return args.length === 0 ? boolean(normalized === "TRUE") : error("#VALUE!");
    const implementation = functions.get(normalized);
    if (implementation === undefined) throw new EvaluationUnavailable("unsupported-function", `Function ${name} is not supported.`);
    if (/^(?:ABS|INT|MOD|POWER|SQRT|SIGN|ROUND|ROUNDUP|ROUNDDOWN|CEILING\.MATH|FLOOR\.MATH|LEN|LEFT|RIGHT|MID|LOWER|UPPER|PROPER|TRIM|FIND|SEARCH|EXACT|SUBSTITUTE|DATE|YEAR|MONTH|DAY|WEEKDAY)$/.test(normalized)) {
      const evaluated = args.map(arg => evaluate(arg, sheet, depth + 1));
      if (evaluated.some(value => "kind" in value && (value.kind === "array" || value.kind === "range" && (value.rows.length > 1 || value.rows[0]!.length > 1)))) {
        const matrices = evaluated.map(matrix);
        const height = Math.max(...matrices.map(rows => rows.length)), width = Math.max(...matrices.map(rows => rows[0]!.length));
        assertArray(height, width);
        if (matrices.some(rows => rows.length !== 1 && rows.length !== height || rows[0]!.length !== 1 && rows[0]!.length !== width)) return error("#VALUE!");
        return {kind: "array", rows: Array.from({length: height}, (_, r) => Array.from({length: width}, (_, c) => {
          operation();
          const scalarArgs: FormulaExpression[] = matrices.map(rows => ({kind: "value", value: rows[rows.length === 1 ? 0 : r]![rows[0]!.length === 1 ? 0 : c]!, start: 0, end: 0}));
          return scalar(implementation(scalarArgs, sheet, depth + 1));
        }))};
      }
      return implementation(evaluated.map(value => ({kind: "value", value: toFunction(value), start: 0, end: 0})), sheet, depth);
    }
    return implementation(args, sheet, depth);
  };

  const diagnose = (address: FormulaCellAddress, formula: string, failure: EvaluationUnavailable) => {
    const key = `${addressKey(address)}\u0000${failure.code}`;
    if (diagnosed.has(key)) return;
    diagnosed.add(key);
    diagnostics.push(Object.freeze({ code: failure.code, address: freezeAddress(address), formula, message: failure.message }));
  };

  let pendingCells = formulaCells;
  while (pendingCells.length) {
  for (const formulaCell of pendingCells) {
    try {
      cellValue(formulaCell.address, 0, false);
    } catch (cause) {
      if (cause instanceof EvaluationUnavailable) diagnose(formulaCell.address, formulaCell.formula, cause);
      else throw cause;
    }
  }
  pendingCells = formulaCells.filter(cell => !memo.has(addressKey(cell.address)) && !unavailable.has(addressKey(cell.address)));
  if (operations > limits.maxOperations) break;
  }
  return new FormulaCalculation(values, dependencies, diagnostics, arrays);
}

type RangeEvaluationValue = { readonly kind: "range"; readonly values: readonly FormulaScalarValue[]; readonly rows: readonly (readonly FormulaScalarValue[])[] };
type EvaluationValue = FunctionValue | RangeEvaluationValue;

class EvaluationUnavailable extends Error {
  readonly code: FormulaDiagnosticCode;

  constructor(code: FormulaDiagnosticCode, message: string) {
    super(message);
    this.name = "EvaluationUnavailable";
    this.code = code;
  }
}

const BLANK = Object.freeze({ type: "blank" as const });

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
        if (sheet !== undefined) {
          const ref = referenceGeometry(node, currentSheet, source);
          if (!("type" in ref)) {
            const scanned = node.whole ? usedReference(ref, source) : ref;
            result.push(...correspondingRangeAddresses(scanned, scanned.height, scanned.width, maxRangeCells));
          }
        }
        break;
      }
      case "unary": case "intersection": case "spill":
      case "percent": visit(node.operand); break;
      case "array": node.rows.forEach(row => row.forEach(visit)); break;
      case "invoke": visit(node.callee); node.arguments.forEach(visit); break;
      case "binary": visit(node.left); visit(node.right); break;
      case "function": {
        if ((node.name === "SUMIF" || node.name === "AVERAGEIF") && node.arguments.length === 3) {
          visit(node.arguments[0]!);
          visit(node.arguments[1]!);
          const inspected = referenceGeometry(node.arguments[0]!, currentSheet, source);
          const projected = referenceGeometry(node.arguments[2]!, currentSheet, source);
          if (isFormulaError(inspected) || isFormulaError(projected)) {
            visit(node.arguments[2]!);
            break;
          }
          result.push(...correspondingRangeAddresses(projected, inspected.height, inspected.width, maxRangeCells));
          break;
        }
        node.arguments.forEach(visit);
        break;
      }
      default: break;
    }
  };
  visit(expression);
  const unique = new Map(result.map((address) => [addressKey(address), address]));
  return [...unique.values()];
}

interface FormulaRangeGeometry {
  readonly sheet: string;
  readonly firstRow: number;
  readonly firstColumn: number;
  readonly height: number;
  readonly width: number;
}

function referenceGeometry(
  expression: FormulaExpression,
  currentSheet: string,
  source: FormulaWorkbookSource,
): FormulaRangeGeometry | Extract<FormulaScalarValue, { type: "error" }> {
  if (expression.kind !== "reference") return error("#VALUE!");
  const sheet = expression.sheet === undefined ? currentSheet : source.resolveSheet(currentSheet, expression.sheet);
  if (sheet === undefined) return error("#REF!");
  const end = expression.endReference ?? expression.startReference;
  const firstRow = Math.min(expression.startReference.row, end.row);
  const lastRow = Math.max(expression.startReference.row, end.row);
  const firstColumn = Math.min(expression.startReference.column, end.column);
  const lastColumn = Math.max(expression.startReference.column, end.column);
  return Object.freeze({
    sheet,
    firstRow,
    firstColumn,
    height: lastRow - firstRow + 1,
    width: lastColumn - firstColumn + 1,
  });
}

/** Bound blank-insensitive aggregate/dependency scans, never reference geometry. */
function usedReference<T extends FormulaRangeGeometry>(ref: T, source: FormulaWorkbookSource): T {
  const used = source.usedDimensions?.(ref.sheet);
  if (!used) return ref;
  return {...ref,
    height: ref.firstRow === 1 && ref.height === MAX_SPREADSHEET_ROW ? Math.max(1, used.rows) : ref.height,
    width: ref.firstColumn === 1 && ref.width === MAX_SPREADSHEET_COLUMN ? Math.max(1, used.columns) : ref.width,
  };
}

function correspondingAddress(
  range: FormulaRangeGeometry,
  rowOffset: number,
  columnOffset: number,
): FormulaCellAddress {
  return Object.freeze({
    sheet: range.sheet,
    row: range.firstRow + rowOffset,
    column: range.firstColumn + columnOffset,
  });
}

function correspondingRangeAddresses(
  range: FormulaRangeGeometry,
  height: number,
  width: number,
  maxRangeCells: number,
): FormulaCellAddress[] {
  assertCorrespondingRange(range, height, width, maxRangeCells);
  const addresses: FormulaCellAddress[] = [];
  for (let rowOffset = 0; rowOffset < height; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < width; columnOffset += 1) {
      addresses.push(Object.freeze({
        sheet: range.sheet,
        row: range.firstRow + rowOffset,
        column: range.firstColumn + columnOffset,
      }));
    }
  }
  return addresses;
}

function assertCorrespondingRange(
  range: FormulaRangeGeometry,
  height: number,
  width: number,
  maxRangeCells: number,
): void {
  assertRangeSize(height, width, maxRangeCells);
  if (range.firstRow + height - 1 > MAX_SPREADSHEET_ROW || range.firstColumn + width - 1 > MAX_SPREADSHEET_COLUMN) {
    throw new EvaluationUnavailable("unsupported-reference", "Formula corresponding range extends beyond the worksheet boundary.");
  }
}

function assertRangeSize(height: number, width: number, maxRangeCells: number): void {
  const count = height * width;
  if (!Number.isSafeInteger(count) || count > maxRangeCells) {
    throw new EvaluationUnavailable("evaluation-limit", "Formula range exceeds the calculation limit.");
  }
}

type CriterionOperator = "=" | "<>" | "<" | "<=" | ">" | ">=";

interface FormulaCriterion {
  readonly operator: CriterionOperator;
  readonly operand: Exclude<FormulaScalarValue, { type: "error" }>;
  readonly wildcard: readonly WildcardToken[] | undefined;
}

type WildcardToken =
  | { readonly kind: "many" }
  | { readonly kind: "one" }
  | { readonly kind: "literal"; readonly value: string };

function compileCriterion(value: Exclude<FormulaScalarValue, { type: "error" }>): FormulaCriterion {
  if (value.type === "blank") return Object.freeze({ operator: "=", operand: number(0), wildcard: undefined });
  if (value.type !== "string") return Object.freeze({ operator: "=", operand: value, wildcard: undefined });
  if ([...value.value].length > MAX_CRITERION_CHARACTERS) {
    throw new EvaluationUnavailable("evaluation-limit", "Formula criterion exceeds the character limit.");
  }
  const operatorMatch = /^(<=|>=|<>|=|<|>)/.exec(value.value);
  const operator = (operatorMatch?.[1] ?? "=") as CriterionOperator;
  const source = value.value.slice(operatorMatch?.[1]?.length ?? 0);
  const trimmed = source.trim();
  if (NUMBER_CRITERION.test(trimmed)) {
    return Object.freeze({ operator, operand: number(Number(trimmed)), wildcard: undefined });
  }
  if (/^(?:TRUE|FALSE)$/i.test(trimmed)) {
    return Object.freeze({ operator, operand: boolean(trimmed.toUpperCase() === "TRUE"), wildcard: undefined });
  }
  if (source.length === 0) return Object.freeze({ operator, operand: string(""), wildcard: undefined });
  const wildcard = operator === "=" || operator === "<>" ? tokenizeWildcard(source) : undefined;
  const hasWildcard = wildcard?.some((token) => token.kind !== "literal") ?? false;
  const operand = string(wildcard === undefined ? source : wildcard.map((token) => token.kind === "literal" ? token.value : token.kind === "one" ? "?" : "*").join(""));
  return Object.freeze({ operator, operand, wildcard: hasWildcard ? wildcard : undefined });
}

function matchesCriterion(value: FormulaScalarValue, criterion: FormulaCriterion): boolean {
  const equal = criterion.wildcard === undefined
    ? criterionEquals(value, criterion.operand)
    : value.type === "string" && wildcardMatches(criterion.wildcard, value.value);
  if (criterion.operator === "=") return equal;
  if (criterion.operator === "<>") return !equal;
  if (!sameComparableType(value, criterion.operand)) return false;
  const comparison = compareCriterion(value, criterion.operand);
  switch (criterion.operator) {
    case "<": return comparison < 0;
    case "<=": return comparison <= 0;
    case ">": return comparison > 0;
    case ">=": return comparison >= 0;
  }
}

function criterionEquals(value: FormulaScalarValue, operand: Exclude<FormulaScalarValue, { type: "error" }>): boolean {
  if (operand.type === "string" && operand.value === "") return value.type === "blank" || value.type === "string" && value.value === "";
  if (value.type === "error" && operand.type === "string") return value.value.toLocaleLowerCase("en-US") === operand.value.toLocaleLowerCase("en-US");
  if (value.type !== operand.type) return false;
  return compareCriterion(value, operand) === 0;
}

function sameComparableType(value: FormulaScalarValue, operand: Exclude<FormulaScalarValue, { type: "error" }>): boolean {
  return value.type === operand.type && value.type !== "blank";
}

function compareCriterion(value: FormulaScalarValue, operand: Exclude<FormulaScalarValue, { type: "error" }>): number {
  if (value.type === "number" && operand.type === "number") return value.value - operand.value;
  if (value.type === "boolean" && operand.type === "boolean") return Number(value.value) - Number(operand.value);
  return text(value).localeCompare(text(operand), "en-US", { sensitivity: "base" });
}

function tokenizeWildcard(source: string): readonly WildcardToken[] {
  const tokens: WildcardToken[] = [];
  const characters = [...source];
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]!;
    if (character === "~" && (characters[index + 1] === "~" || characters[index + 1] === "*" || characters[index + 1] === "?")) {
      tokens.push(Object.freeze({ kind: "literal", value: characters[index + 1]! }));
      index += 1;
    } else if (character === "*") {
      if (tokens.at(-1)?.kind !== "many") tokens.push(Object.freeze({ kind: "many" }));
    } else if (character === "?") tokens.push(Object.freeze({ kind: "one" }));
    else tokens.push(Object.freeze({ kind: "literal", value: character }));
  }
  return Object.freeze(tokens);
}

/** The capped pattern keeps greedy matching linear in candidate length without regex backtracking. */
function wildcardMatches(tokens: readonly WildcardToken[], candidate: string): boolean {
  const text = [...candidate.toLocaleLowerCase("en-US")];
  const pattern: WildcardToken[] = [];
  for (const token of tokens) {
    if (token.kind !== "literal") pattern.push(token);
    else for (const value of token.value.toLocaleLowerCase("en-US")) pattern.push(Object.freeze({ kind: "literal", value }));
  }
  let textIndex = 0;
  let patternIndex = 0;
  let starIndex = -1;
  let starTextIndex = -1;
  while (textIndex < text.length) {
    const token = pattern[patternIndex];
    if (token?.kind === "one" || token?.kind === "literal" && token.value === text[textIndex]) {
      textIndex += 1;
      patternIndex += 1;
      continue;
    }
    if (token?.kind === "many") {
      starIndex = patternIndex;
      starTextIndex = textIndex;
      patternIndex += 1;
      continue;
    }
    if (starIndex >= 0) {
      starTextIndex += 1;
      textIndex = starTextIndex;
      patternIndex = starIndex + 1;
      continue;
    }
    return false;
  }
  while (pattern[patternIndex]?.kind === "many") patternIndex += 1;
  return patternIndex === pattern.length;
}

function isFormulaError<T>(value: T | Extract<FormulaScalarValue, { type: "error" }>): value is Extract<FormulaScalarValue, { type: "error" }> {
  return typeof value === "object" && value !== null && "type" in value && value.type === "error";
}

const NUMBER_CRITERION = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[Ee][+-]?[0-9]+)?$/;
const MAX_CRITERION_CHARACTERS = 8_192;
const MAX_FORMULA_TEXT_CHARACTERS = 32_767;
const MAX_SPREADSHEET_ROW = 1_048_576;
const MAX_SPREADSHEET_COLUMN = 16_384;
const DAY_MILLISECONDS = 86_400_000;

function normalizeFunctionName(name: string): string {
  return name.toUpperCase().replace(/^_XLFN\./, "").replace(/^_XLWS\./, "");
}

function normalizeBindingName(name: string): string {
  return name.toUpperCase().replace(/^_XLPM\./, "");
}

function formulaContainsAggregate(formula: string): boolean {
  let expression: FormulaExpression;
  try {
    expression = parseFormula(formula).expression;
  } catch {
    return false;
  }
  const visit = (node: FormulaExpression): boolean => {
    if (node.kind === "function") {
      const name = normalizeFunctionName(node.name);
      return name === "SUBTOTAL" || name === "AGGREGATE" || node.arguments.some(visit);
    }
    if (node.kind === "binary") return visit(node.left) || visit(node.right);
    if (node.kind === "unary" || node.kind === "percent") return visit(node.operand);
    return false;
  };
  return visit(expression);
}

function sumNumbers(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function varianceAggregate(values: readonly number[], sample: boolean, squareRoot: boolean): FormulaScalarValue {
  if (values.length < (sample ? 2 : 1)) return error("#DIV/0!");
  const mean = sumNumbers(values) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - (sample ? 1 : 0));
  return finite(squareRoot ? Math.sqrt(variance) : variance);
}

function medianAggregate(values: readonly number[]): FormulaScalarValue {
  if (values.length === 0) return error("#NUM!");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return finite(sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!);
}

function modeAggregate(values: readonly number[]): FormulaScalarValue {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let result: number | undefined;
  let count = 1;
  for (const [value, occurrences] of counts) {
    if (occurrences > count || occurrences === count && result !== undefined && value < result) {
      result = value;
      count = occurrences;
    }
  }
  return result === undefined ? error("#N/A") : number(result);
}

function rankedAggregate(values: readonly number[], rawK: number | undefined, largest: boolean): FormulaScalarValue {
  const k = rawK === undefined ? Number.NaN : Math.trunc(rawK);
  if (!Number.isFinite(k) || k < 1 || k > values.length) return error("#NUM!");
  const sorted = [...values].sort((left, right) => largest ? right - left : left - right);
  return number(sorted[k - 1]!);
}

function percentileAggregate(
  values: readonly number[],
  k: number | undefined,
  inclusive: boolean,
  quartile = false,
): FormulaScalarValue {
  if (values.length === 0 || k === undefined || !Number.isFinite(k)) return error("#NUM!");
  if (quartile) {
    const quartileNumber = k * 4;
    if (!Number.isInteger(quartileNumber) || inclusive && (quartileNumber < 0 || quartileNumber > 4) || !inclusive && (quartileNumber < 1 || quartileNumber > 3)) {
      return error("#NUM!");
    }
  }
  if (inclusive ? k < 0 || k > 1 : k <= 0 || k >= 1) return error("#NUM!");
  const sorted = [...values].sort((left, right) => left - right);
  const rank = inclusive ? (sorted.length - 1) * k : (sorted.length + 1) * k - 1;
  if (rank < 0 || rank > sorted.length - 1) return error("#NUM!");
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  return finite(sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (rank - lower));
}

interface ExcelDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly syntheticLeapDay?: boolean;
}

function serialToDateParts(serial: number, dateSystem: "1900" | "1904"): ExcelDateParts | undefined {
  if (!Number.isFinite(serial) || serial < 0) return undefined;
  const days = Math.floor(serial);
  if (dateSystem === "1900" && days === 60) {
    return Object.freeze({ year: 1900, month: 2, day: 29, syntheticLeapDay: true });
  }
  const base = dateSystem === "1904" ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const adjusted = dateSystem === "1900" && days > 60 ? days - 1 : days;
  const date = new Date(base + adjusted * DAY_MILLISECONDS);
  return Object.freeze({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}

function excelSundayZero(serial: number, dateSystem: "1900" | "1904"): number {
  const adjusted = dateSystem === "1904" ? serial + 5 : serial - (serial > 59 ? 1 : 0);
  return ((adjusted % 7) + 7) % 7;
}

function datePartsToSerial(
  year: number,
  month: number,
  day: number,
  dateSystem: "1900" | "1904",
): Extract<FormulaScalarValue, { type: "number" | "error" }> {
  if (year === 1900 && month === 2 && day === 29 && dateSystem === "1900") return number(60);
  const date = utcDate(year, month, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return error("#VALUE!");
  return dateToSerial(date, dateSystem);
}

function normalizedDateToSerial(
  year: number,
  month: number,
  day: number,
  dateSystem: "1900" | "1904",
): Extract<FormulaScalarValue, { type: "number" | "error" }> {
  const date = utcDate(year, month, day);
  return dateToSerial(date, dateSystem);
}

function dateToSerial(date: Date, dateSystem: "1900" | "1904"): Extract<FormulaScalarValue, { type: "number" | "error" }> {
  const base = dateSystem === "1904" ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  let serial = Math.round((date.getTime() - base) / DAY_MILLISECONDS);
  if (dateSystem === "1900" && date.getTime() >= Date.UTC(1900, 2, 1)) serial += 1;
  return serial < 0 || date.getUTCFullYear() > 9999 ? error("#NUM!") : number(serial);
}

function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function shiftMonth(year: number, month: number, delta: number): { readonly year: number; readonly month: number } {
  const absolute = year * 12 + month - 1 + delta;
  return Object.freeze({ year: Math.floor(absolute / 12), month: ((absolute % 12) + 12) % 12 + 1 });
}

function daysInMonth(year: number, month: number): number {
  return utcDate(year, month + 1, 0).getUTCDate();
}

function parseInvariantDate(value: string): ExcelDateParts | undefined {
  const normalized = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalized);
  const parts = iso === null
    ? slash === null ? undefined : { year: Number(slash[3]), month: Number(slash[1]), day: Number(slash[2]) }
    : { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  if (parts === undefined || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > daysInMonth(parts.year, parts.month)) return undefined;
  return Object.freeze(parts);
}

function excelRound(
  value: number,
  digitsValue: number,
  direction: "nearest" | "away" | "toward",
): Extract<FormulaScalarValue, { type: "number" | "error" }> {
  const digits = Math.trunc(digitsValue);
  if (Math.abs(digits) > 308) return digits > 0 ? number(value) : number(0);
  const factor = 10 ** Math.abs(digits);
  const scaled = digits >= 0 ? value * factor : value / factor;
  if (!Number.isFinite(scaled)) return number(value);
  const magnitude = Math.abs(scaled);
  const rounded = direction === "away"
    ? Math.ceil(magnitude)
    : direction === "toward"
      ? Math.floor(magnitude)
      : Math.floor(magnitude + 0.5 + Number.EPSILON * magnitude);
  const result = Math.sign(scaled) * rounded;
  return finite(digits >= 0 ? result / factor : result * factor);
}

function mathMultiple(value: number, significance: number, mode: boolean, ceiling: boolean): number {
  if (value >= 0) {
    return (ceiling ? Math.ceil(value / significance) : Math.floor(value / significance)) * significance;
  }
  const magnitude = Math.abs(value) / significance;
  const rounded = ceiling
    ? mode ? Math.ceil(magnitude) : Math.floor(magnitude)
    : mode ? Math.floor(magnitude) : Math.ceil(magnitude);
  return -rounded * significance;
}

function textFunctionArity(name: string): readonly [minimum: number, maximum: number] {
  switch (name) {
    case "LEN": case "LOWER": case "UPPER": case "PROPER": case "TRIM": return [1, 1];
    case "LEFT": case "RIGHT": return [1, 2];
    case "MID": return [3, 3];
    case "FIND": case "SEARCH": return [2, 3];
    case "EXACT": return [2, 2];
    case "SUBSTITUTE": return [3, 4];
    default: return [0, 0];
  }
}

function properCase(value: string): string {
  let atWordStart = true;
  let result = "";
  for (const character of value) {
    const letterOrNumber = /[\p{L}\p{N}]/u.test(character);
    result += letterOrNumber
      ? atWordStart ? character.toLocaleUpperCase("en-US") : character.toLocaleLowerCase("en-US")
      : character;
    atWordStart = !letterOrNumber;
  }
  return result;
}

function boundedString(value: string): FormulaScalarValue {
  return value.length > MAX_FORMULA_TEXT_CHARACTERS ? error("#VALUE!") : string(value);
}

function scalar(value: EvaluationValue): FormulaScalarValue {
  if ("kind" in value && (value.kind === "array" || value.kind === "range") && value.rows.length === 1 && value.rows[0]?.length === 1) return value.rows[0][0]!;
  return "kind" in value ? value.kind === "omitted" ? BLANK : error(value.kind === "lambda" ? "#CALC!" : "#VALUE!") : value;
}

function flatten(values: readonly EvaluationValue[]): FormulaScalarValue[] {
  return values.flatMap(value => matrix(value).flat());
}

function numbersForAggregate(values: readonly EvaluationValue[]): number[] {
  return values.flatMap((value) => {
    if ("kind" in value) return matrix(value).flatMap(row => row.flatMap(cell => cell.type === "number" ? [cell.value] : []));
    if (value.type === "number") return [value.value];
    if (value.type === "boolean") return [value.value ? 1 : 0];
    if (value.type === "string" && value.value.trim() !== "") {
      const parsed = Number(value.value);
      if (Number.isFinite(parsed)) return [parsed];
    }
    return [];
  });
}

function logicalAggregate(values: readonly EvaluationValue[], and: boolean, xor = false): FormulaScalarValue {
  const logicals = flatten(values).flatMap((value) => {
    if (value.type === "boolean") return [value.value];
    if (value.type === "number") return [value.value !== 0];
    return [];
  });
  if (logicals.length === 0) return error("#VALUE!");
  return boolean(and ? logicals.every(Boolean) : xor ? logicals.filter(Boolean).length % 2 === 1 : logicals.some(Boolean));
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

function matrix(value: EvaluationValue): readonly (readonly FormulaScalarValue[])[] {
  if (!("kind" in value)) return [[value]];
  if (value.kind === "array" || value.kind === "range") return value.rows;
  return [[value.kind === "omitted" ? BLANK : error("#CALC!")]];
}

function toFunction(value: EvaluationValue): FunctionValue {
  // Extension handlers retain the scalar context contract for one-cell reads.
  // Core aggregates consume the range provenance before crossing this boundary.
  if (isRange(value) && value.rows.length === 1 && value.rows[0]?.length === 1) return value.rows[0][0]!;
  return isRange(value) ? {kind: "array", rows: value.rows} : value;
}

function walkExpression(expression: FormulaExpression, visit: (node: FormulaExpression) => void): void {
  visit(expression);
  switch (expression.kind) {
    case "binary": walkExpression(expression.left, visit); walkExpression(expression.right, visit); break;
    case "unary": case "percent": case "spill": case "intersection": walkExpression(expression.operand, visit); break;
    case "function": expression.arguments.forEach(arg => walkExpression(arg, visit)); break;
    case "invoke": walkExpression(expression.callee, visit); expression.arguments.forEach(arg => walkExpression(arg, visit)); break;
    case "array": expression.rows.forEach(row => row.forEach(arg => walkExpression(arg, visit))); break;
  }
}
