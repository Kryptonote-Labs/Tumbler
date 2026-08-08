import type { LosslessXmlDocument, LosslessXmlElement } from "@tumblerjs/ooxml";
import {
  calculateFormulas,
  parseFormula,
  type FormulaCellAddress,
  type FormulaCellInput,
  type FormulaExpression,
  type FormulaReferenceExpression,
  type FormulaScalarValue,
  type FormulaWorkbookSource,
} from "@tumblerjs/formulas";
import {
  EXCEL_MAX_COLUMNS,
  EXCEL_MAX_ROWS,
  formatCellReference,
  parseCellReference,
  parseCellRange,
  type CellAddress,
  type CellRange,
} from "./references.ts";
import type { SpreadsheetCalculationSnapshot } from "./calculation.ts";
import type { SpreadsheetDifferentialFormat, SpreadsheetStyles } from "./styles.ts";
import { SpreadsheetError } from "./workbook.ts";
import type { SpreadsheetCellValue, SpreadsheetWorksheet } from "./worksheet.ts";

const MAX_CONDITIONAL_FORMAT_RANGES = 4_096;
const MAX_CONDITIONAL_FORMAT_RULES = 4_096;
const MAX_CONDITIONAL_FORMULA_LENGTH = 8_192;
const CONDITION_SHEET = "\u0000conditional-format";
const CONDITION_CELL = Object.freeze({ sheet: CONDITION_SHEET, row: 0, column: 0 });

export type SpreadsheetConditionalFormattingOperator =
  | "between" | "equal" | "greaterThan" | "greaterThanOrEqual"
  | "lessThan" | "lessThanOrEqual" | "notBetween" | "notEqual";

interface SpreadsheetConditionalRuleBase {
  readonly priority: number;
  readonly stopIfTrue: boolean;
  readonly differentialFormatId: number | undefined;
  readonly sourceOrder: number;
}

export type SpreadsheetConditionalFormattingRule =
  | (SpreadsheetConditionalRuleBase & {
    readonly kind: "cellIs";
    readonly operator: SpreadsheetConditionalFormattingOperator;
    readonly formulas: readonly string[];
  })
  | (SpreadsheetConditionalRuleBase & {
    readonly kind: "expression";
    readonly formula: string;
  })
  | (SpreadsheetConditionalRuleBase & {
    readonly kind: "unsupported";
    readonly sourceType: string | undefined;
    readonly reason: string;
  });

export interface SpreadsheetConditionalFormatting {
  readonly ranges: readonly CellRange[];
  readonly rules: readonly SpreadsheetConditionalFormattingRule[];
  readonly pivot: boolean;
}

export type SpreadsheetConditionalFormattingDiagnosticCode =
  | "unsupported-rule"
  | "unsupported-formula";

export interface SpreadsheetConditionalFormattingDiagnostic {
  readonly code: SpreadsheetConditionalFormattingDiagnosticCode;
  readonly priority: number;
  readonly reference: string;
  readonly message: string;
}

/** Sparse, immutable view of conditional styles. Styles are evaluated only for requested cells. */
export class SpreadsheetConditionalStyleProjection {
  readonly #worksheet: SpreadsheetWorksheet;
  readonly #calculation: SpreadsheetCalculationSnapshot | undefined;
  readonly #rules: readonly ApplicableRule[];
  readonly #cache = new Map<string, readonly SpreadsheetDifferentialFormat[]>();
  readonly #diagnostics = new Map<string, SpreadsheetConditionalFormattingDiagnostic>();

  constructor(worksheet: SpreadsheetWorksheet, calculation?: SpreadsheetCalculationSnapshot) {
    this.#worksheet = worksheet;
    this.#calculation = calculation;
    this.#rules = Object.freeze(worksheet.conditionalFormatting
      .flatMap((format) => format.rules.map((rule) => ({ format, rule })))
      .sort((left, right) => left.rule.priority - right.rule.priority || left.rule.sourceOrder - right.rule.sourceOrder));
  }

  get diagnostics(): readonly SpreadsheetConditionalFormattingDiagnostic[] {
    return Object.freeze([...this.#diagnostics.values()]);
  }

  formats(reference: string | CellAddress): readonly SpreadsheetDifferentialFormat[] {
    const address = typeof reference === "string" ? parseCellReference(reference) : reference;
    const normalized = formatCellReference(address);
    const cached = this.#cache.get(normalized);
    if (cached !== undefined) return cached;
    const matched: SpreadsheetDifferentialFormat[] = [];
    for (const { format, rule } of this.#rules) {
      if (!format.ranges.some((range) => contains(range, address))) continue;
      if (format.pivot) {
        this.#diagnose("unsupported-rule", rule, normalized, "PivotTable conditional formatting is unsupported.");
        continue;
      }
      const result = this.#matches(rule, format.ranges[0]!.start, address, normalized);
      if (result !== true) continue;
      const differential = rule.differentialFormatId === undefined
        ? undefined
        : this.#worksheet.styles.differentialFormats[rule.differentialFormatId];
      if (differential !== undefined) matched.push(differential);
      if (rule.stopIfTrue) break;
    }
    // Lower-priority rules are encountered last. Render them first so a higher-
    // priority declaration wins when two differential records set one property.
    const result = Object.freeze(matched.reverse());
    this.#cache.set(normalized, result);
    return result;
  }

  #matches(
    rule: SpreadsheetConditionalFormattingRule,
    origin: CellAddress,
    target: CellAddress,
    reference: string,
  ): boolean | undefined {
    if (rule.kind === "unsupported") {
      this.#diagnose("unsupported-rule", rule, reference, rule.reason);
      return undefined;
    }
    let formula: string;
    try {
      if (rule.kind === "expression") {
        formula = `IF((${translateFormula(rule.formula, origin, target)}),TRUE,FALSE)`;
      } else {
        const translated = rule.formulas.map((candidate) => `(${translateFormula(candidate, origin, target)})`);
        const cell = formatCellReference(target);
        formula = cellIsFormula(cell, rule.operator, translated);
      }
      const source = new ConditionalFormulaSource(this.#worksheet, this.#calculation, formula);
      const calculation = calculateFormulas(source, {
        maxFormulaCells: 1,
        maxRangeCells: 10_000,
        maxOperations: 100_000,
        maxEvaluationDepth: 256,
      });
      const diagnostic = calculation.diagnostics[0];
      if (diagnostic !== undefined) {
        this.#diagnose("unsupported-formula", rule, reference, diagnostic.message);
        return undefined;
      }
      const value = calculation.value(CONDITION_CELL);
      return value?.type === "boolean" ? value.value : undefined;
    } catch (cause) {
      this.#diagnose("unsupported-formula", rule, reference, cause instanceof Error ? cause.message : "The formula could not be evaluated.");
      return undefined;
    }
  }

  #diagnose(
    code: SpreadsheetConditionalFormattingDiagnosticCode,
    rule: SpreadsheetConditionalFormattingRule,
    reference: string,
    message: string,
  ): void {
    const key = `${code}\u0000${rule.sourceOrder}\u0000${reference}`;
    if (this.#diagnostics.has(key)) return;
    this.#diagnostics.set(key, Object.freeze({ code, priority: rule.priority, reference, message }));
  }
}

interface ApplicableRule {
  readonly format: SpreadsheetConditionalFormatting;
  readonly rule: SpreadsheetConditionalFormattingRule;
}

/** Parses worksheet conditional-format semantics without expanding their ranges. */
export function parseSpreadsheetConditionalFormatting(
  document: LosslessXmlDocument,
  namespace: string,
  styles: SpreadsheetStyles,
): readonly SpreadsheetConditionalFormatting[] {
  const result: SpreadsheetConditionalFormatting[] = [];
  let rangeCount = 0;
  let ruleCount = 0;
  let sourceOrder = 0;
  for (const element of children(document.root, namespace, "conditionalFormatting")) {
    const rawRanges = attr(element, "sqref");
    if (rawRanges === undefined || rawRanges.trim() === "") throw conditionalError("Conditional formatting requires sqref.");
    const ranges = rawRanges.trim().split(/\s+/).map((raw) => conditionalRange(raw));
    rangeCount += ranges.length;
    if (rangeCount > MAX_CONDITIONAL_FORMAT_RANGES) throw conditionalError("Conditional-format range count exceeds the supported limit.");
    const ruleElements = children(element, namespace, "cfRule");
    if (ruleElements.length === 0) throw conditionalError("Conditional formatting requires at least one rule.");
    ruleCount += ruleElements.length;
    if (ruleCount > MAX_CONDITIONAL_FORMAT_RULES) throw conditionalError("Conditional-format rule count exceeds the supported limit.");
    const rules = ruleElements.map((rule) => parseRule(rule, document, namespace, styles, sourceOrder++));
    result.push(Object.freeze({
      ranges: Object.freeze(ranges),
      rules: Object.freeze(rules),
      pivot: xmlBoolean(attr(element, "pivot"), false, "conditional formatting pivot"),
    }));
  }
  return Object.freeze(result);
}

export function projectSpreadsheetConditionalStyles(
  worksheet: SpreadsheetWorksheet,
  calculation?: SpreadsheetCalculationSnapshot,
): SpreadsheetConditionalStyleProjection {
  return new SpreadsheetConditionalStyleProjection(worksheet, calculation);
}

function parseRule(
  element: LosslessXmlElement,
  document: LosslessXmlDocument,
  namespace: string,
  styles: SpreadsheetStyles,
  sourceOrder: number,
): SpreadsheetConditionalFormattingRule {
  const type = attr(element, "type");
  const priority = signedPositiveInteger(requiredAttribute(element, "priority"), "conditional formatting priority");
  const stopIfTrue = xmlBoolean(attr(element, "stopIfTrue"), false, "conditional formatting stopIfTrue");
  const rawDxfId = attr(element, "dxfId");
  const differentialFormatId = rawDxfId === undefined ? undefined : unsignedInteger(rawDxfId, "conditional formatting dxfId");
  if (differentialFormatId !== undefined && styles.differentialFormats[differentialFormatId] === undefined) {
    throw conditionalError(`Conditional formatting references missing differential format ${differentialFormatId}.`);
  }
  const base = { priority, stopIfTrue, differentialFormatId, sourceOrder };
  const formulas = children(element, namespace, "formula").map((formula) => {
    const value = document.textContent(formula);
    if (value.length > MAX_CONDITIONAL_FORMULA_LENGTH) throw conditionalError("Conditional-format formula exceeds the supported length limit.");
    return value;
  });
  if (type === "expression") {
    return formulas.length === 1
      ? Object.freeze({ ...base, kind: "expression", formula: formulas[0]! })
      : unsupported(base, type, "Expression rules require exactly one formula.");
  }
  if (type === "cellIs") {
    const operator = attr(element, "operator");
    if (!isCellIsOperator(operator)) return unsupported(base, type, `Cell-is operator ${JSON.stringify(operator)} is unsupported.`);
    const expected = operator === "between" || operator === "notBetween" ? 2 : 1;
    return formulas.length === expected
      ? Object.freeze({ ...base, kind: "cellIs", operator, formulas: Object.freeze(formulas) })
      : unsupported(base, type, `Cell-is operator ${operator} requires ${expected} formula${expected === 1 ? "" : "s"}.`);
  }
  return unsupported(base, type, `Conditional-format rule type ${JSON.stringify(type)} is unsupported.`);
}

function unsupported(
  base: SpreadsheetConditionalRuleBase,
  sourceType: string | undefined,
  reason: string,
): SpreadsheetConditionalFormattingRule {
  return Object.freeze({ ...base, kind: "unsupported", sourceType, reason });
}

function cellIsFormula(cell: string, operator: SpreadsheetConditionalFormattingOperator, formulas: readonly string[]): string {
  switch (operator) {
    case "between": return `AND(${cell}>=${formulas[0]},${cell}<=${formulas[1]})`;
    case "notBetween": return `OR(${cell}<${formulas[0]},${cell}>${formulas[1]})`;
    case "equal": return `${cell}=${formulas[0]}`;
    case "notEqual": return `${cell}<>${formulas[0]}`;
    case "greaterThan": return `${cell}>${formulas[0]}`;
    case "greaterThanOrEqual": return `${cell}>=${formulas[0]}`;
    case "lessThan": return `${cell}<${formulas[0]}`;
    case "lessThanOrEqual": return `${cell}<=${formulas[0]}`;
  }
}

function translateFormula(formula: string, origin: CellAddress, target: CellAddress): string {
  const parsed = parseFormula(formula);
  const references: FormulaReferenceExpression[] = [];
  collectReferenceExpressions(parsed.expression, references);
  let result = formula;
  for (const reference of references.sort((left, right) => right.start - left.start)) {
    const shiftedStart = shiftReference(reference.startReference, origin, target);
    const shiftedEnd = reference.endReference === undefined ? undefined : shiftReference(reference.endReference, origin, target);
    const qualifier = reference.sheet === undefined ? "" : `${quoteSheetName(reference.sheet)}!`;
    const replacement = `${qualifier}${formatFormulaReference(shiftedStart)}${shiftedEnd === undefined ? "" : `:${formatFormulaReference(shiftedEnd)}`}`;
    result = result.slice(0, reference.start) + replacement + result.slice(reference.end);
  }
  return result;
}

function collectReferenceExpressions(expression: FormulaExpression, result: FormulaReferenceExpression[]): void {
  switch (expression.kind) {
    case "reference": result.push(expression); break;
    case "unary":
    case "percent": collectReferenceExpressions(expression.operand, result); break;
    case "binary": collectReferenceExpressions(expression.left, result); collectReferenceExpressions(expression.right, result); break;
    case "function": expression.arguments.forEach((argument) => collectReferenceExpressions(argument, result)); break;
    default: break;
  }
}

function shiftReference(
  reference: FormulaReferenceExpression["startReference"],
  origin: CellAddress,
  target: CellAddress,
): FormulaReferenceExpression["startReference"] {
  const row = reference.absoluteRow ? reference.row : reference.row + target.row - origin.row;
  const column = reference.absoluteColumn ? reference.column : reference.column + target.column - origin.column;
  if (row < 1 || row > EXCEL_MAX_ROWS || column < 1 || column > EXCEL_MAX_COLUMNS) {
    throw new RangeError("A relative conditional-format reference moved outside the worksheet grid.");
  }
  return Object.freeze({ ...reference, row, column });
}

function formatFormulaReference(reference: FormulaReferenceExpression["startReference"]): string {
  const plain = formatCellReference({ row: reference.row, column: reference.column });
  const match = /^([A-Z]+)([0-9]+)$/.exec(plain)!;
  return `${reference.absoluteColumn ? "$" : ""}${match[1]}${reference.absoluteRow ? "$" : ""}${match[2]}`;
}

function quoteSheetName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : `'${name.replaceAll("'", "''")}'`;
}

class ConditionalFormulaSource implements FormulaWorkbookSource {
  readonly formulaCells: readonly { readonly address: FormulaCellAddress; readonly formula: string }[];
  readonly #worksheet: SpreadsheetWorksheet;
  readonly #calculation: SpreadsheetCalculationSnapshot | undefined;

  constructor(worksheet: SpreadsheetWorksheet, calculation: SpreadsheetCalculationSnapshot | undefined, formula: string) {
    this.#worksheet = worksheet;
    this.#calculation = calculation;
    this.formulaCells = Object.freeze([{ address: CONDITION_CELL, formula }]);
  }

  cell(address: FormulaCellAddress): FormulaCellInput | undefined {
    if (address.sheet === CONDITION_SHEET && address.row === 0 && address.column === 0) {
      return Object.freeze({ formula: this.formulaCells[0]!.formula, value: Object.freeze({ type: "blank" }) });
    }
    const sheet = address.sheet === CONDITION_SHEET
      ? this.#worksheet.sheet
      : this.#worksheet.workbook.sheets.find((candidate) => String(candidate.sheetId) === address.sheet);
    if (sheet === undefined) return undefined;
    // This first slice deliberately keeps cross-sheet conditional formulas inert;
    // ordinary worksheet calculation remains responsible for cross-sheet values.
    if (sheet !== this.#worksheet.sheet) return undefined;
    const worksheet = this.#worksheet;
    const cell = worksheet.cell({ row: address.row, column: address.column });
    if (cell === undefined) return undefined;
    const calculated = worksheet === this.#worksheet ? this.#calculation?.value(cell.address) : undefined;
    return Object.freeze({ formula: undefined, value: formulaValue(calculated ?? cell.value) });
  }

  resolveSheet(_currentSheet: string, name: string): string | undefined {
    const sheet = this.#worksheet.workbook.sheet(name);
    return sheet === undefined ? undefined : String(sheet.sheetId);
  }
}

function formulaValue(value: SpreadsheetCellValue): FormulaScalarValue {
  switch (value.type) {
    case "blank": return Object.freeze({ type: "blank" });
    case "boolean": return Object.freeze({ type: "boolean", value: value.value });
    case "date": return Object.freeze({ type: "string", value: value.value });
    case "error": return Object.freeze({ type: "error", value: value.value.startsWith("#") ? value.value as `#${string}` : "#VALUE!" });
    case "number": return Object.freeze({ type: "number", value: value.value });
    case "string": return Object.freeze({ type: "string", value: value.value });
  }
}

function conditionalRange(raw: string): CellRange {
  try {
    return parseCellRange(raw);
  } catch (cause) {
    throw conditionalError(`Conditional formatting has invalid range ${JSON.stringify(raw)}.`, cause);
  }
}

function contains(range: CellRange, address: CellAddress): boolean {
  return address.row >= range.start.row && address.row <= range.end.row &&
    address.column >= range.start.column && address.column <= range.end.column;
}

function isCellIsOperator(value: string | undefined): value is SpreadsheetConditionalFormattingOperator {
  return value !== undefined && [
    "between", "equal", "greaterThan", "greaterThanOrEqual", "lessThan", "lessThanOrEqual", "notBetween", "notEqual",
  ].includes(value);
}

function children(parent: LosslessXmlElement, namespace: string, name: string): LosslessXmlElement[] {
  return parent.children.filter((node): node is LosslessXmlElement =>
    node.kind === "element" && node.namespaceUri === namespace && node.localName === name
  );
}

function attr(element: LosslessXmlElement, name: string): string | undefined {
  return element.attributes.find((candidate) => candidate.namespaceUri === "" && candidate.localName === name)?.value;
}

function requiredAttribute(element: LosslessXmlElement, name: string): string {
  const value = attr(element, name);
  if (value === undefined) throw conditionalError(`Conditional-format rule requires ${name}.`);
  return value;
}

function signedPositiveInteger(raw: string, context: string): number {
  if (!/^[1-9][0-9]*$/.test(raw)) throw conditionalError(`${context} must be a positive integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > 0x7fffffff) throw conditionalError(`${context} is outside the signed integer range.`);
  return value;
}

function unsignedInteger(raw: string, context: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/.test(raw)) throw conditionalError(`${context} must be an unsigned integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > 0xffffffff) throw conditionalError(`${context} is outside the unsigned integer range.`);
  return value;
}

function xmlBoolean(raw: string | undefined, defaultValue: boolean, context: string): boolean {
  if (raw === undefined) return defaultValue;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  throw conditionalError(`${context} must be an XML boolean.`);
}

function conditionalError(message: string, cause?: unknown): SpreadsheetError {
  return new SpreadsheetError("invalid_worksheet", message, cause === undefined ? {} : { cause });
}
