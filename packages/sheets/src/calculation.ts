import {
  calculateFormulas,
  parseFormula,
  type FunctionReference,
  type FormulaExpression,
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

  arrayValue(reference: string | CellAddress) {
    const address = typeof reference === "string" ? parseCellReference(reference) : reference;
    return this.calculation.arrayValue({sheet: sheetKey(this.worksheet.sheet), ...address});
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
  const instant = new Date((formulaOptions.now?.() ?? new Date()).getTime());
  const baseSource = new SpreadsheetFormulaSource(worksheet.workbook, worksheet);
  try {
    const calculate = (source: SpreadsheetFormulaSource) => calculateFormulas(source, {
      ...formulaOptions,
      now: () => new Date(instant.getTime()),
      dateSystem: worksheet.workbook.dateSystem,
    });
    const base = calculate(baseSource);
    const visibility = calculateFilterVisibility(
      worksheet.workbook,
      base,
      tableViewStates,
      worksheetFilterStates,
      formulaOptions.maxRangeCells ?? 100_000,
    );
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
    this.formulaCells = Object.freeze(workbook.sheets.flatMap(sheet => {
      const worksheet = this.#worksheet(sheet);
      return worksheet.rows.flatMap(row => row.cells.flatMap(cell => cell.formula === undefined ? [] : [{
        address: Object.freeze({sheet: sheetKey(sheet), row: cell.address.row, column: cell.address.column}),
        formula: cell.formula,
      }]));
    }));
  }

  cell(address: FormulaCellAddress): FormulaCellInput | undefined {
    const sheet = this.#sheetByKey(address.sheet);
    if (sheet === undefined) return undefined;
    const worksheet = this.#worksheet(sheet);
    const cell = worksheet.cell({ row: address.row, column: address.column });
    if (cell === undefined) return undefined;
    const style = worksheet.cellStyle(address);
    return Object.freeze({ formula: cell.formula, value: formulaValue(cell.value), numberFormatId: style.numberFormatId, ...(style.numberFormatCode === undefined ? {} : {numberFormatCode: style.numberFormatCode}) });
  }

  resolveSheet(_currentSheet: string, name: string): string | undefined {
    const sheet = this.#workbook.sheet(name);
    return sheet === undefined ? undefined : sheetKey(sheet);
  }

  spillBlocked(address: FormulaCellAddress): boolean {
    const sheet = this.#sheetByKey(address.sheet);
    if (!sheet) return true;
    const worksheet = this.#worksheet(sheet);
    return worksheet.mergedRange(address) !== undefined || worksheet.tables.some(table =>
      address.row >= table.range.start.row && address.row <= table.range.end.row && address.column >= table.range.start.column && address.column <= table.range.end.column);
  }

  sheetNames(): readonly string[] { return this.#workbook.sheets.map(sheet => sheet.name); }

  sheetIndex(key: string): number | undefined {
    const index = this.#workbook.sheets.findIndex(sheet => sheetKey(sheet) === key);
    return index < 0 ? undefined : index + 1;
  }

  usedDimensions(key: string) {
    const sheet = this.#sheetByKey(key);
    if (!sheet) return {rows: 1, columns: 1};
    const worksheet = this.#worksheet(sheet);
    let rows = 1, columns = 1;
    for (const row of worksheet.rows) for (const cell of row.cells) {
      rows = Math.max(rows, cell.address.row); columns = Math.max(columns, cell.address.column);
    }
    return {rows, columns};
  }

  resolveName(name: string, address: FormulaCellAddress): FormulaExpression | FunctionReference | undefined {
    const root = this.#workbook.document.root;
    const containers = root.children.filter(node => node.kind === "element" && node.localName === "definedNames");
    const currentIndex = this.sheetIndex(address.sheet);
    let global: FormulaExpression | undefined;
    for (const container of containers) {
      if (container.kind !== "element") continue;
      for (const node of container.children) {
        if (node.kind !== "element" || node.localName !== "definedName") continue;
        const attr = (key: string) => node.attributes.find(attr => attr.localName === key && attr.namespaceUri === "")?.value;
        if (attr("name")?.toUpperCase() !== name.toUpperCase()) continue;
        const scope = attr("localSheetId");
        if (scope !== undefined && Number(scope) !== (currentIndex ?? 0) - 1) continue;
        const formula = node.children.map(child => child.kind === "text" || child.kind === "cdata" ? child.value : "").join("");
        try {
          const expression = parseFormula(formula).expression;
          if (scope !== undefined) return expression;
          global = expression;
        } catch { /* Unsupported external or legacy name syntax stays unresolved. */ }
      }
    }
    if (global) return global;
    const match = /^([^[]+)\[(.*)\]$/.exec(name);
    if (!match) return undefined;
    for (const sheet of this.#workbook.sheets) for (const table of this.#worksheet(sheet).tables) {
      if (![table.name.toUpperCase(), table.displayName.toUpperCase()].includes(match[1]!.toUpperCase())) continue;
      const selector = match[2]!;
      const labels = [...selector.matchAll(/\[([^\]]+)\]/g)].map(match => match[1]!);
      if (!labels.length) labels.push(selector);
      const normalizedLabels = labels.map(label => label.toUpperCase());
      const dataLabels = labels.filter(label => !label.startsWith("#"));
      const selected = dataLabels.map(label => table.columns.findIndex(column => column.name.toUpperCase() === label.replace(/^@/, "").toUpperCase()));
      if (selected.some(index => index < 0) || selected.length > 1 && !selector.includes(":")) return undefined;
      let firstRow = table.range.start.row + table.headerRowCount;
      let lastRow = table.range.end.row - table.totalsRowCount;
      if (normalizedLabels.includes("#ALL")) { firstRow = table.range.start.row; lastRow = table.range.end.row; }
      else if (normalizedLabels.includes("#HEADERS")) { firstRow = table.range.start.row; lastRow = firstRow + table.headerRowCount - 1; }
      else if (normalizedLabels.includes("#TOTALS")) { lastRow = table.range.end.row; firstRow = lastRow - table.totalsRowCount + 1; }
      else if (normalizedLabels.includes("#THIS ROW") || dataLabels.some(label => label.startsWith("@"))) { firstRow = address.row; lastRow = address.row; }
      if (lastRow < firstRow) return undefined;
      const firstColumn = table.range.start.column + (selected.length ? Math.min(...selected) : 0);
      const lastColumn = table.range.start.column + (selected.length ? Math.max(...selected) : table.columns.length - 1);
      return {sheet: sheetKey(sheet), firstRow, firstColumn, height: lastRow - firstRow + 1, width: lastColumn - firstColumn + 1};
    }
    return undefined;
  }

  rowVisibility(sheetKeyValue: string, row: number) {
    const sheet = this.#sheetByKey(sheetKeyValue);
    if (sheet === undefined) return Object.freeze({ filteredOut: false, manuallyHidden: false, determinate: false });
    const worksheet = this.#worksheet(sheet);
    const state = this.#visibility?.get(sheetKeyValue);
    const filteredOut = state?.filteredRows.has(row) ?? false;
    const rawHidden = worksheet.row(row)?.hidden ?? false;
    return Object.freeze({
      filteredOut,
      manuallyHidden: rawHidden && !filteredOut,
      determinate: state?.indeterminateRanges.some((range) => row >= range.first && row <= range.last) !== true,
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
  readonly indeterminateRanges: readonly { readonly first: number; readonly last: number }[];
}

function calculateFilterVisibility(
  workbook: SpreadsheetWorkbook,
  base: FormulaCalculation,
  tableViewStates: Readonly<Record<string, SpreadsheetTableViewState>> | undefined,
  worksheetFilterStates: Readonly<Record<string, SpreadsheetTableViewState>> | undefined,
  maxFilterRows: number,
): ReadonlyMap<string, SpreadsheetRowVisibilityState> | undefined {
  const worksheets = workbook.sheets.map((sheet) => openWorksheet(workbook, sheet));
  if (!worksheets.some((worksheet) => worksheet.autoFilter !== undefined || worksheet.tables.some((table) => table.autoFilter !== undefined))) {
    return undefined;
  }
  const result = new Map<string, SpreadsheetRowVisibilityState>();
  for (const worksheet of worksheets) {
    const filteredRows = new Set<number>();
    const indeterminateRanges: Array<{ readonly first: number; readonly last: number }> = [];
    const provider = calculationValueProvider(worksheet, base);
    const worksheetState = worksheetFilterStates?.[sheetKey(worksheet.sheet)];
    if (worksheet.autoFilter !== undefined) {
      const first = worksheet.autoFilter.range.start.row + 1;
      const last = worksheet.autoFilter.range.end.row;
      const saved = savedSpreadsheetAutoFilterView(worksheet.autoFilter);
      const effectiveState = worksheetState ?? saved.state;
      if (worksheetState === undefined && saved.warnings.includes("unsupported-filter")) {
        indeterminateRanges.push(Object.freeze({ first, last }));
      } else if (effectiveState.filters.length > 0 && last - first + 1 > maxFilterRows) {
        indeterminateRanges.push(Object.freeze({ first, last }));
      } else if (effectiveState.filters.length > 0) projectSpreadsheetAutoFilter(worksheet, worksheet.autoFilter, effectiveState, provider)
        .filteredRows.forEach((row) => filteredRows.add(row));
    }
    for (const table of worksheet.tables) {
      if (table.autoFilter === undefined) continue;
      const state = tableViewStates?.[table.partName.value];
      const saved = savedSpreadsheetTableView(table);
      const first = table.range.start.row + table.headerRowCount;
      const last = table.range.end.row - table.totalsRowCount;
      const effectiveState = state ?? saved.state;
      if (state === undefined && saved.warnings.includes("unsupported-filter")) {
        indeterminateRanges.push(Object.freeze({ first, last }));
      } else if (effectiveState.filters.length > 0 && last - first + 1 > maxFilterRows) {
        indeterminateRanges.push(Object.freeze({ first, last }));
      } else if (effectiveState.filters.length > 0) projectSpreadsheetTable(worksheet, table, effectiveState, provider)
        .filteredRows.forEach((row) => filteredRows.add(row));
    }
    result.set(sheetKey(worksheet.sheet), Object.freeze({ filteredRows, indeterminateRanges: Object.freeze(indeterminateRanges) }));
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
