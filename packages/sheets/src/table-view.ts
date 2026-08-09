import type {
  SpreadsheetAutoFilter,
  SpreadsheetCustomFilter,
  SpreadsheetFilterCriteria,
  SpreadsheetTable,
} from "./tables.ts";
import type { SpreadsheetCellValue, SpreadsheetWorksheet } from "./worksheet.ts";

export type SpreadsheetTableViewCriteria = Exclude<SpreadsheetFilterCriteria, { readonly kind: "unsupported" }>;

export interface SpreadsheetTableViewFilter {
  /** Zero-based column offset within the table. */
  readonly columnId: number;
  readonly criteria: SpreadsheetTableViewCriteria;
}

export interface SpreadsheetTableViewSort {
  /** Zero-based column offset within the table. */
  readonly columnId: number;
  readonly direction: "ascending" | "descending";
  readonly caseSensitive: boolean;
}

export interface SpreadsheetTableViewState {
  readonly filters: readonly SpreadsheetTableViewFilter[];
  readonly sorts: readonly SpreadsheetTableViewSort[];
}

export type SpreadsheetTableViewWarning =
  | "unsupported-filter"
  | "unsupported-sort-direction"
  | "unsupported-sort-method";

export interface SpreadsheetTableViewProjection {
  /** Source worksheet row numbers in their projected visual order. */
  readonly rows: readonly number[];
  /** Source worksheet rows excluded by supported filter criteria. */
  readonly filteredRows: readonly number[];
  readonly state: SpreadsheetTableViewState;
  readonly warnings: readonly SpreadsheetTableViewWarning[];
}

export interface SpreadsheetTableValueProvider {
  value(row: number, column: number): SpreadsheetCellValue | undefined;
  displayText(row: number, column: number): string;
}

/** Converts supported saved table state into a view state without changing package bytes. */
export function savedSpreadsheetTableView(table: SpreadsheetTable): {
  readonly state: SpreadsheetTableViewState;
  readonly warnings: readonly SpreadsheetTableViewWarning[];
} {
  return savedSpreadsheetAutoFilterView(table.autoFilter, table.range.start.column, table.columns.length);
}

/** Converts a worksheet or table AutoFilter into the same headless view state. */
export function savedSpreadsheetAutoFilterView(
  autoFilter: SpreadsheetAutoFilter | undefined,
  firstColumn = autoFilter?.range.start.column ?? 1,
  columnCount = autoFilter === undefined ? 0 : autoFilter.range.end.column - autoFilter.range.start.column + 1,
): {
  readonly state: SpreadsheetTableViewState;
  readonly warnings: readonly SpreadsheetTableViewWarning[];
} {
  const warnings: SpreadsheetTableViewWarning[] = [];
  const filters: SpreadsheetTableViewFilter[] = [];
  for (const column of autoFilter?.columns ?? []) {
    if (column.criteria?.kind === "unsupported") warnings.push("unsupported-filter");
    else if (column.criteria !== undefined) filters.push(Object.freeze({ columnId: column.columnId, criteria: column.criteria }));
  }
  const sorts: SpreadsheetTableViewSort[] = [];
  const sortState = autoFilter?.sortState;
  if (sortState?.columnSort === true) warnings.push("unsupported-sort-direction");
  else {
    for (const condition of sortState?.conditions ?? []) {
      if (condition.sortBy !== "value") {
        warnings.push("unsupported-sort-method");
        continue;
      }
      const columnId = condition.range.start.column - firstColumn;
      if (columnId < 0 || columnId >= columnCount || condition.range.start.column !== condition.range.end.column) {
        warnings.push("unsupported-sort-direction");
        continue;
      }
      sorts.push(Object.freeze({
        columnId,
        direction: condition.descending ? "descending" : "ascending",
        caseSensitive: sortState?.caseSensitive ?? false,
      }));
    }
  }
  return Object.freeze({
    state: freezeState({ filters, sorts }),
    warnings: Object.freeze(unique(warnings)),
  });
}

/** Projects table body rows using cached/scalar values. Formulas are never evaluated here. */
export function projectSpreadsheetTable(
  worksheet: SpreadsheetWorksheet,
  table: SpreadsheetTable,
  state: SpreadsheetTableViewState = savedSpreadsheetTableView(table).state,
  values: SpreadsheetTableValueProvider | undefined = undefined,
): SpreadsheetTableViewProjection {
  if (!worksheet.tables.includes(table)) throw new TypeError("The table does not belong to this worksheet.");
  const bodyStart = table.range.start.row + table.headerRowCount;
  const bodyEnd = table.range.end.row - table.totalsRowCount;
  return projectFilterRange(worksheet, table.range.start.column, table.columns.length, bodyStart, bodyEnd, state, values, savedSpreadsheetTableView(table).warnings);
}

/** Projects the body of a worksheet AutoFilter; its first row is the field header. */
export function projectSpreadsheetAutoFilter(
  worksheet: SpreadsheetWorksheet,
  autoFilter: SpreadsheetAutoFilter,
  state: SpreadsheetTableViewState = savedSpreadsheetAutoFilterView(autoFilter).state,
  values: SpreadsheetTableValueProvider | undefined = undefined,
): SpreadsheetTableViewProjection {
  const belongsToWorksheet = worksheet.autoFilter === autoFilter || worksheet.tables.some((table) => table.autoFilter === autoFilter);
  if (!belongsToWorksheet) throw new TypeError("The AutoFilter does not belong to this worksheet.");
  const columnCount = autoFilter.range.end.column - autoFilter.range.start.column + 1;
  return projectFilterRange(
    worksheet,
    autoFilter.range.start.column,
    columnCount,
    autoFilter.range.start.row + 1,
    autoFilter.range.end.row,
    state,
    values,
    savedSpreadsheetAutoFilterView(autoFilter).warnings,
  );
}

function projectFilterRange(
  worksheet: SpreadsheetWorksheet,
  firstColumn: number,
  columnCount: number,
  bodyStart: number,
  bodyEnd: number,
  state: SpreadsheetTableViewState,
  values: SpreadsheetTableValueProvider | undefined,
  warnings: readonly SpreadsheetTableViewWarning[],
): SpreadsheetTableViewProjection {
  validateState(columnCount, state);
  const sourceRows = bodyEnd < bodyStart
    ? []
    : Array.from({ length: bodyEnd - bodyStart + 1 }, (_, index) => bodyStart + index);
  const filters = new Map(state.filters.map((filter) => [filter.columnId, filter.criteria]));
  const rows = sourceRows.filter((row) => [...filters].every(([columnId, criteria]) =>
    matches(worksheet, row, firstColumn + columnId, criteria, values)
  ));
  const includedRows = new Set(rows);
  const filteredRows = sourceRows.filter((row) => !includedRows.has(row));
  const sorts = state.sorts;
  if (sorts.length > 0) {
    rows.sort((left, right) => {
      for (const sort of sorts) {
        const column = firstColumn + sort.columnId;
        const comparison = compareCells(cellValue(worksheet, left, column, values), cellValue(worksheet, right, column, values), sort.caseSensitive);
        if (comparison !== 0) return sort.direction === "descending" ? -comparison : comparison;
      }
      return left - right;
    });
  }
  return Object.freeze({
    rows: Object.freeze(rows),
    filteredRows: Object.freeze(filteredRows),
    state: freezeState(state),
    warnings: Object.freeze([...warnings]),
  });
}

/** Returns display values for a filter menu, including cached formula results. */
export function spreadsheetTableDistinctValues(
  worksheet: SpreadsheetWorksheet,
  table: SpreadsheetTable,
  columnId: number,
  source: SpreadsheetTableValueProvider | undefined = undefined,
): readonly string[] {
  validateColumn(table.columns.length, columnId);
  const bodyStart = table.range.start.row + table.headerRowCount;
  const bodyEnd = table.range.end.row - table.totalsRowCount;
  const values = new Set<string>();
  for (let row = bodyStart; row <= bodyEnd; row += 1) {
    values.add(displayText(worksheet, row, table.range.start.column + columnId, source));
  }
  return Object.freeze([...values].sort((left, right) => collator(false).compare(left, right)));
}

export function setSpreadsheetTableValueFilter(
  state: SpreadsheetTableViewState,
  columnId: number,
  values: readonly string[],
  includeBlank = values.includes(""),
): SpreadsheetTableViewState {
  const filters = state.filters.filter((filter) => filter.columnId !== columnId);
  filters.push(Object.freeze({
    columnId,
    criteria: Object.freeze({ kind: "values" as const, values: Object.freeze([...new Set(values)]), includeBlank }),
  }));
  return freezeState({ filters, sorts: state.sorts });
}

export function clearSpreadsheetTableFilter(state: SpreadsheetTableViewState, columnId: number): SpreadsheetTableViewState {
  return freezeState({ filters: state.filters.filter((filter) => filter.columnId !== columnId), sorts: state.sorts });
}

export function setSpreadsheetTableSort(
  state: SpreadsheetTableViewState,
  columnId: number,
  direction: "ascending" | "descending" | undefined,
): SpreadsheetTableViewState {
  return freezeState({
    filters: state.filters,
    sorts: direction === undefined ? [] : [{ columnId, direction, caseSensitive: false }],
  });
}

function matches(
  worksheet: SpreadsheetWorksheet,
  row: number,
  column: number,
  criteria: SpreadsheetTableViewCriteria,
  source: SpreadsheetTableValueProvider | undefined,
): boolean {
  const value = cellValue(worksheet, row, column, source);
  const text = displayText(worksheet, row, column, source);
  if (criteria.kind === "values") {
    if (isBlank(value, text)) return criteria.includeBlank;
    return criteria.values.some((candidate) => candidate.localeCompare(text, "en-US", { sensitivity: "base" }) === 0);
  }
  const results = criteria.conditions.map((condition) => matchesCustom(value, text, condition));
  return criteria.join === "and" ? results.every(Boolean) : results.some(Boolean);
}

function cellValue(worksheet: SpreadsheetWorksheet, row: number, column: number, source: SpreadsheetTableValueProvider | undefined): SpreadsheetCellValue | undefined {
  return source?.value(row, column) ?? worksheet.cell({ row, column })?.value;
}

function displayText(worksheet: SpreadsheetWorksheet, row: number, column: number, source: SpreadsheetTableValueProvider | undefined): string {
  return source?.displayText(row, column) ?? worksheet.displayText({ row, column });
}

function matchesCustom(value: SpreadsheetCellValue | undefined, text: string, condition: SpreadsheetCustomFilter): boolean {
  if (condition.operator === "equal" || condition.operator === "notEqual") {
    const equal = wildcardPattern(condition.value).test(text);
    return condition.operator === "equal" ? equal : !equal;
  }
  const rawNumber = value?.type === "number" ? value.value : Number(text);
  const conditionNumber = Number(condition.value);
  const comparison = Number.isFinite(rawNumber) && Number.isFinite(conditionNumber)
    ? rawNumber - conditionNumber
    : collator(false).compare(text, condition.value);
  switch (condition.operator) {
    case "lessThan": return comparison < 0;
    case "lessThanOrEqual": return comparison <= 0;
    case "greaterThan": return comparison > 0;
    case "greaterThanOrEqual": return comparison >= 0;
    default: return false;
  }
}

function compareCells(left: SpreadsheetCellValue | undefined, right: SpreadsheetCellValue | undefined, caseSensitive: boolean): number {
  const leftBlank = left === undefined || left.type === "blank";
  const rightBlank = right === undefined || right.type === "blank";
  if (leftBlank || rightBlank) return leftBlank === rightBlank ? 0 : leftBlank ? 1 : -1;
  if (left.type === "number" && right.type === "number") return left.value - right.value;
  if (left.type === "boolean" && right.type === "boolean") return Number(left.value) - Number(right.value);
  return collator(caseSensitive).compare(String(left.value), String(right.value));
}

function isBlank(value: SpreadsheetCellValue | undefined, text: string): boolean {
  return value === undefined || value.type === "blank" || text === "";
}

function wildcardPattern(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === "~" && index + 1 < pattern.length) {
      source += escapeRegex(pattern[++index]!);
    } else if (character === "*") source += ".*";
    else if (character === "?") source += ".";
    else source += escapeRegex(character);
  }
  return new RegExp(`^${source}$`, "iu");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collator(caseSensitive: boolean): Intl.Collator {
  return new Intl.Collator("en-US", { numeric: true, sensitivity: caseSensitive ? "variant" : "base" });
}

function freezeState(state: SpreadsheetTableViewState): SpreadsheetTableViewState {
  return Object.freeze({ filters: Object.freeze([...state.filters]), sorts: Object.freeze([...state.sorts]) });
}

function validateState(columnCount: number, state: SpreadsheetTableViewState): void {
  const filterIds = new Set<number>();
  for (const filter of state.filters) {
    validateColumn(columnCount, filter.columnId);
    if (filterIds.has(filter.columnId)) throw new RangeError(`Table filter column ${filter.columnId} is repeated.`);
    filterIds.add(filter.columnId);
  }
  const sortIds = new Set<number>();
  for (const sort of state.sorts) {
    validateColumn(columnCount, sort.columnId);
    if (sortIds.has(sort.columnId)) throw new RangeError(`Table sort column ${sort.columnId} is repeated.`);
    sortIds.add(sort.columnId);
  }
}

function validateColumn(columnCount: number, columnId: number): void {
  if (!Number.isSafeInteger(columnId) || columnId < 0 || columnId >= columnCount) {
    throw new RangeError(`Table column ${columnId} is outside the table range.`);
  }
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
