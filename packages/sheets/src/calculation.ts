import {
  calculateFormulas,
  type FormulaCalculation,
  type FormulaCalculationOptions,
  type FormulaCellAddress,
  type FormulaCellInput,
  type FormulaScalarValue,
  type FormulaWorkbookSource,
} from "@tumbler/formulas";
import { formatCellReference, parseCellReference, type CellAddress } from "./references.ts";
import { openWorksheet, type SpreadsheetCellValue, type SpreadsheetWorksheet } from "./worksheet.ts";
import type { SpreadsheetSheet, SpreadsheetWorkbook } from "./workbook.ts";

/** Immutable calculated-value overlay. It never writes formula caches into the package. */
export class SpreadsheetCalculationSnapshot {
  readonly worksheet: SpreadsheetWorksheet;
  readonly calculation: FormulaCalculation;

  constructor(worksheet: SpreadsheetWorksheet, calculation: FormulaCalculation) {
    this.worksheet = worksheet;
    this.calculation = calculation;
  }

  get diagnostics() {
    return this.calculation.diagnostics;
  }

  value(reference: string | CellAddress): SpreadsheetCellValue | undefined {
    const address = typeof reference === "string" ? parseCellReference(reference) : reference;
    const value = this.calculation.value({ sheet: sheetKey(this.worksheet.sheet), ...address });
    return value === undefined ? undefined : spreadsheetValue(value);
  }

  /** Uses a calculated result when available and otherwise retains the worksheet's cached display. */
  displayText(reference: string | CellAddress, locale = "en-US"): string {
    return this.worksheet.formatValue(reference, this.value(reference) ?? this.worksheet.cell(reference)?.value, locale);
  }
}

export function calculateSpreadsheetWorksheet(
  worksheet: SpreadsheetWorksheet,
  options: FormulaCalculationOptions = {},
): SpreadsheetCalculationSnapshot {
  const source = new SpreadsheetFormulaSource(worksheet.workbook, worksheet);
  return new SpreadsheetCalculationSnapshot(worksheet, calculateFormulas(source, options));
}

class SpreadsheetFormulaSource implements FormulaWorkbookSource {
  readonly formulaCells: readonly { readonly address: FormulaCellAddress; readonly formula: string }[];
  readonly #workbook: SpreadsheetWorkbook;
  readonly #worksheets = new Map<number, SpreadsheetWorksheet>();

  constructor(workbook: SpreadsheetWorkbook, activeWorksheet: SpreadsheetWorksheet) {
    this.#workbook = workbook;
    this.#worksheets.set(activeWorksheet.sheet.sheetId, activeWorksheet);
    this.formulaCells = Object.freeze(activeWorksheet.rows.flatMap((row) => row.cells.flatMap((cell) =>
      cell.formula === undefined ? [] : [{
        address: Object.freeze({ sheet: sheetKey(activeWorksheet.sheet), row: cell.address.row, column: cell.address.column }),
        formula: cell.formula,
      }]
    )));
  }

  cell(address: FormulaCellAddress): FormulaCellInput | undefined {
    const sheet = this.#sheetByKey(address.sheet);
    if (sheet === undefined) return undefined;
    const cell = this.#worksheet(sheet).cell({ row: address.row, column: address.column });
    if (cell === undefined) return undefined;
    return Object.freeze({ formula: cell.formula, value: formulaValue(cell.value) });
  }

  resolveSheet(_currentSheet: string, name: string): string | undefined {
    const sheet = this.#workbook.sheet(name);
    return sheet === undefined ? undefined : sheetKey(sheet);
  }

  #sheetByKey(key: string): SpreadsheetSheet | undefined {
    if (!/^(?:0|[1-9][0-9]*)$/.test(key)) return undefined;
    const id = Number(key);
    return this.#workbook.sheets.find((sheet) => sheet.sheetId === id);
  }

  #worksheet(sheet: SpreadsheetSheet): SpreadsheetWorksheet {
    const existing = this.#worksheets.get(sheet.sheetId);
    if (existing !== undefined) return existing;
    const worksheet = openWorksheet(this.#workbook, sheet);
    this.#worksheets.set(sheet.sheetId, worksheet);
    return worksheet;
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

function spreadsheetValue(value: FormulaScalarValue): SpreadsheetCellValue {
  switch (value.type) {
    case "blank": return Object.freeze({ type: "blank" });
    case "boolean": return Object.freeze({ type: "boolean", value: value.value });
    case "error": return Object.freeze({ type: "error", value: value.value });
    case "number": return Object.freeze({ type: "number", value: value.value, lexical: String(value.value) });
    case "string": return Object.freeze({ type: "string", value: value.value, storage: "formula" });
  }
}

function sheetKey(sheet: SpreadsheetSheet): string {
  return String(sheet.sheetId);
}
