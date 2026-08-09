import {
  calculateFormulas,
  FormulaCalculation,
  type FormulaCalculationOptions,
  type FormulaCellAddress,
  type FormulaCellInput,
  type FormulaScalarValue,
  type FormulaWorkbookSource,
} from "@tumblerjs/formulas";
import { formatCellReference, parseCellReference, type CellAddress } from "./references.ts";
import { openWorksheet, type SpreadsheetCellValue, type SpreadsheetWorksheet } from "./worksheet.ts";
import type { SpreadsheetSheet, SpreadsheetWorkbook } from "./workbook.ts";
import {
  projectSpreadsheetAutoFilter,
  projectSpreadsheetTable,
  savedSpreadsheetAutoFilterView,
  savedSpreadsheetTableView,
  type SpreadsheetTableViewState,
  type SpreadsheetTableValueProvider,
} from "./table-view.ts";

export interface SpreadsheetCalculationOptions extends FormulaCalculationOptions {
  /** View-only table filter states keyed by the table part name. */
  readonly tableViewStates?: Readonly<Record<string, SpreadsheetTableViewState>>;
  /** View-only worksheet AutoFilter states keyed by decimal sheet id. */
  readonly worksheetFilterStates?: Readonly<Record<string, SpreadsheetTableViewState>>;
}

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
  options: SpreadsheetCalculationOptions = {},
): SpreadsheetCalculationSnapshot {
  const { tableViewStates, worksheetFilterStates, ...formulaOptions } = options;
  const baseSource = new SpreadsheetFormulaSource(worksheet.workbook, worksheet);
  try {
    const calculate = (source: SpreadsheetFormulaSource) => calculateFormulas(source, {
      ...formulaOptions,
      dateSystem: worksheet.workbook.dateSystem,
    });
    const base = calculate(baseSource);
    const visibility = calculateFilterVisibility(worksheet.workbook, base, tableViewStates, worksheetFilterStates);
    const calculation = visibility === undefined
      ? base
      : calculate(new SpreadsheetFormulaSource(worksheet.workbook, worksheet, visibility));
    return new SpreadsheetCalculationSnapshot(worksheet, calculation);
  } catch (cause) {
    if (!(cause instanceof RangeError)) throw cause;
    const first = baseSource.formulaCells[0];
    const diagnostics = first === undefined ? [] : [{
      code: "evaluation-limit" as const,
      address: first.address,
      formula: first.formula,
      message: cause.message,
    }];
    return new SpreadsheetCalculationSnapshot(worksheet, new FormulaCalculation(new Map(), new Map(), diagnostics));
  }
}

class SpreadsheetFormulaSource implements FormulaWorkbookSource {
  readonly formulaCells: readonly { readonly address: FormulaCellAddress; readonly formula: string }[];
  readonly #workbook: SpreadsheetWorkbook;
  readonly #worksheets = new Map<number, SpreadsheetWorksheet>();
  readonly #visibility: ReadonlyMap<string, SpreadsheetRowVisibilityState> | undefined;

  constructor(
    workbook: SpreadsheetWorkbook,
    activeWorksheet: SpreadsheetWorksheet,
    visibility?: ReadonlyMap<string, SpreadsheetRowVisibilityState>,
  ) {
    this.#workbook = workbook;
    this.#visibility = visibility;
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

  rowVisibility(sheetKeyValue: string, row: number) {
    const sheet = this.#sheetByKey(sheetKeyValue);
    if (sheet === undefined) return Object.freeze({ filteredOut: false, manuallyHidden: false, determinate: false });
    const worksheet = this.#worksheet(sheet);
    const state = this.#visibility?.get(sheetKeyValue);
    const filteredOut = state?.filteredRows.has(row) ?? false;
    const rawHidden = worksheet.rows.find((candidate) => candidate.index === row)?.hidden ?? false;
    return Object.freeze({
      filteredOut,
      manuallyHidden: rawHidden && !filteredOut,
      determinate: state?.indeterminateRows.has(row) !== true,
    });
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

interface SpreadsheetRowVisibilityState {
  readonly filteredRows: ReadonlySet<number>;
  readonly indeterminateRows: ReadonlySet<number>;
}

function calculateFilterVisibility(
  workbook: SpreadsheetWorkbook,
  base: FormulaCalculation,
  tableViewStates: Readonly<Record<string, SpreadsheetTableViewState>> | undefined,
  worksheetFilterStates: Readonly<Record<string, SpreadsheetTableViewState>> | undefined,
): ReadonlyMap<string, SpreadsheetRowVisibilityState> | undefined {
  const worksheets = workbook.sheets.map((sheet) => openWorksheet(workbook, sheet));
  if (!worksheets.some((worksheet) => worksheet.autoFilter !== undefined || worksheet.tables.some((table) => table.autoFilter !== undefined))) {
    return undefined;
  }
  const result = new Map<string, SpreadsheetRowVisibilityState>();
  for (const worksheet of worksheets) {
    const filteredRows = new Set<number>();
    const indeterminateRows = new Set<number>();
    const provider = calculationValueProvider(worksheet, base);
    const worksheetState = worksheetFilterStates?.[sheetKey(worksheet.sheet)];
    if (worksheet.autoFilter !== undefined) {
      const saved = savedSpreadsheetAutoFilterView(worksheet.autoFilter);
      const projection = projectSpreadsheetAutoFilter(worksheet, worksheet.autoFilter, worksheetState ?? saved.state, provider);
      projection.filteredRows.forEach((row) => filteredRows.add(row));
      if (worksheetState === undefined && saved.warnings.includes("unsupported-filter")) {
        addRows(indeterminateRows, worksheet.autoFilter.range.start.row + 1, worksheet.autoFilter.range.end.row);
      }
    }
    for (const table of worksheet.tables) {
      if (table.autoFilter === undefined) continue;
      const state = tableViewStates?.[table.partName.value];
      const saved = savedSpreadsheetTableView(table);
      const projection = projectSpreadsheetTable(worksheet, table, state ?? saved.state, provider);
      projection.filteredRows.forEach((row) => filteredRows.add(row));
      if (state === undefined && saved.warnings.includes("unsupported-filter")) {
        addRows(indeterminateRows, table.range.start.row + table.headerRowCount, table.range.end.row - table.totalsRowCount);
      }
    }
    result.set(sheetKey(worksheet.sheet), Object.freeze({ filteredRows, indeterminateRows }));
  }
  return result;
}

function calculationValueProvider(worksheet: SpreadsheetWorksheet, calculation: FormulaCalculation): SpreadsheetTableValueProvider {
  return Object.freeze({
    value: (row: number, column: number) => {
      const calculated = calculation.value({ sheet: sheetKey(worksheet.sheet), row, column });
      return calculated === undefined ? worksheet.cell({ row, column })?.value : spreadsheetValue(calculated);
    },
    displayText: (row: number, column: number) => {
      const calculated = calculation.value({ sheet: sheetKey(worksheet.sheet), row, column });
      return worksheet.formatValue({ row, column }, calculated === undefined ? worksheet.cell({ row, column })?.value : spreadsheetValue(calculated));
    },
  });
}

function addRows(rows: Set<number>, first: number, last: number): void {
  for (let row = first; row <= last; row += 1) rows.add(row);
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
