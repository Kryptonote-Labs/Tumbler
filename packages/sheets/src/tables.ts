import type { LosslessXmlElement } from "@tumbler/ooxml";
import { parseLosslessXml } from "@tumbler/ooxml";
import type { OpcPart, PartName } from "@tumbler/opc";
import { parseCellRange, type CellRange } from "./references.ts";
import { SpreadsheetError, type SpreadsheetWorkbook } from "./workbook.ts";

const TABLE_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml";

export type SpreadsheetFilterCriteria =
  | { readonly kind: "values"; readonly values: readonly string[]; readonly includeBlank: boolean }
  | { readonly kind: "custom"; readonly join: "and" | "or"; readonly conditions: readonly SpreadsheetCustomFilter[] }
  | { readonly kind: "unsupported"; readonly element: string };

export type SpreadsheetCustomFilterOperator =
  | "equal"
  | "notEqual"
  | "lessThan"
  | "lessThanOrEqual"
  | "greaterThan"
  | "greaterThanOrEqual";

export interface SpreadsheetCustomFilter {
  readonly operator: SpreadsheetCustomFilterOperator;
  readonly value: string;
}

export interface SpreadsheetFilterColumn {
  /** Zero-based column offset within the AutoFilter range. */
  readonly columnId: number;
  readonly hiddenButton: boolean;
  readonly showButton: boolean;
  readonly criteria: SpreadsheetFilterCriteria | undefined;
}

export interface SpreadsheetSortCondition {
  readonly range: CellRange;
  readonly descending: boolean;
  readonly sortBy: "value" | "cellColor" | "fontColor" | "icon";
}

export interface SpreadsheetSortState {
  readonly range: CellRange;
  readonly caseSensitive: boolean;
  readonly columnSort: boolean;
  readonly conditions: readonly SpreadsheetSortCondition[];
}

export interface SpreadsheetAutoFilter {
  readonly range: CellRange;
  readonly columns: readonly SpreadsheetFilterColumn[];
  readonly sortState: SpreadsheetSortState | undefined;
}

export interface SpreadsheetTableColumn {
  readonly id: number;
  readonly name: string;
  readonly totalsRowLabel: string | undefined;
  readonly totalsRowFunction: string | undefined;
}

export interface SpreadsheetTableStyle {
  readonly name: string | undefined;
  readonly showFirstColumn: boolean;
  readonly showLastColumn: boolean;
  readonly showRowStripes: boolean;
  readonly showColumnStripes: boolean;
}

export interface SpreadsheetTable {
  readonly id: number;
  readonly name: string;
  readonly displayName: string;
  readonly range: CellRange;
  readonly headerRowCount: number;
  readonly totalsRowCount: number;
  readonly columns: readonly SpreadsheetTableColumn[];
  readonly style: SpreadsheetTableStyle | undefined;
  readonly autoFilter: SpreadsheetAutoFilter | undefined;
  readonly relationshipId: string;
  readonly partName: PartName;
}

export function readSpreadsheetTables(input: {
  workbook: SpreadsheetWorkbook;
  worksheetPart: OpcPart;
  worksheetRoot: LosslessXmlElement;
  spreadsheetNamespace: string;
  relationshipsNamespace: string;
}): readonly SpreadsheetTable[] {
  const containers = children(input.worksheetRoot, input.spreadsheetNamespace, "tableParts");
  if (containers.length > 1) invalid("A worksheet must not repeat tableParts.");
  const container = containers[0];
  if (container === undefined) return Object.freeze([]);
  const tableParts = children(container, input.spreadsheetNamespace, "tablePart");
  const declaredCount = optionalUnsigned(container, "count", "tableParts count");
  if (declaredCount !== undefined && declaredCount !== tableParts.length) {
    invalid("The tableParts count does not match its tablePart children.");
  }

  const relationships = input.workbook.package.relationships(input.worksheetPart.name);
  const expectedRelationshipType = `${input.relationshipsNamespace}/table`;
  const seenRelationships = new Set<string>();
  const seenParts = new Set<string>();
  const tables = tableParts.map((tablePart) => {
    const relationshipId = qualifiedAttr(tablePart, input.relationshipsNamespace, "id");
    if (relationshipId === undefined || relationshipId.length === 0) invalid("A tablePart requires a relationship id.");
    if (seenRelationships.has(relationshipId)) invalid(`Table relationship ${JSON.stringify(relationshipId)} is repeated.`);
    seenRelationships.add(relationshipId);
    const relationship = relationships.get(relationshipId);
    if (relationship === undefined || relationship.targetMode !== "Internal" || relationship.type !== expectedRelationshipType) {
      invalid(`Table relationship ${JSON.stringify(relationshipId)} must target an internal table part.`);
    }
    const part = input.workbook.package.getPart(relationship.targetPartName);
    if (part?.contentType !== TABLE_CONTENT_TYPE) invalid(`Table relationship ${JSON.stringify(relationshipId)} has an unsupported content type.`);
    if (seenParts.has(part.name.equivalenceKey)) invalid(`Table part ${JSON.stringify(part.name.value)} is referenced more than once.`);
    seenParts.add(part.name.equivalenceKey);
    return parseTable(input.workbook, part, relationshipId, input.spreadsheetNamespace);
  });

  const ids = new Set<number>();
  const names = new Set<string>();
  for (const table of tables) {
    const normalizedName = table.name.toLocaleLowerCase("en-US");
    if (ids.has(table.id)) invalid(`Table id ${table.id} is repeated on the worksheet.`);
    if (names.has(normalizedName)) invalid(`Table name ${JSON.stringify(table.name)} is repeated on the worksheet.`);
    ids.add(table.id);
    names.add(normalizedName);
  }
  return Object.freeze(tables);
}

export function parseSpreadsheetAutoFilter(
  parent: LosslessXmlElement,
  spreadsheetNamespace: string,
): SpreadsheetAutoFilter | undefined {
  const filters = children(parent, spreadsheetNamespace, "autoFilter");
  if (filters.length > 1) invalid("A table or worksheet must not repeat autoFilter.");
  const filter = filters[0];
  if (filter === undefined) return undefined;
  const rawRange = attr(filter, "ref");
  if (rawRange === undefined) invalid("An autoFilter requires a ref.");
  const range = tableRange(rawRange, "AutoFilter range");
  const width = range.end.column - range.start.column + 1;
  const seenColumns = new Set<number>();
  const columns = children(filter, spreadsheetNamespace, "filterColumn").map((element) => {
    const rawColumnId = attr(element, "colId");
    if (rawColumnId === undefined) invalid("A filterColumn requires colId.");
    const columnId = unsigned(rawColumnId, "filter column id");
    if (columnId >= width) invalid(`Filter column id ${columnId} is outside its AutoFilter range.`);
    if (seenColumns.has(columnId)) invalid(`Filter column id ${columnId} is repeated.`);
    seenColumns.add(columnId);
    return Object.freeze({
      columnId,
      hiddenButton: booleanAttr(element, "hiddenButton", false),
      showButton: booleanAttr(element, "showButton", true),
      criteria: parseCriteria(element, spreadsheetNamespace),
    });
  });
  const sortStates = children(filter, spreadsheetNamespace, "sortState");
  if (sortStates.length > 1) invalid("An autoFilter must not repeat sortState.");
  return Object.freeze({ range, columns: Object.freeze(columns), sortState: parseSortState(sortStates[0], spreadsheetNamespace) });
}

function parseTable(workbook: SpreadsheetWorkbook, part: OpcPart, relationshipId: string, namespace: string): SpreadsheetTable {
  let root: LosslessXmlElement;
  try {
    root = parseLosslessXml(workbook.package.readPart(part)).root;
  } catch (cause) {
    throw new SpreadsheetError("invalid_table", `Table part ${JSON.stringify(part.name.value)} is not valid XML.`, { cause });
  }
  if (root.namespaceUri !== namespace || root.localName !== "table") invalid("A table part must have a SpreadsheetML table root element.");
  const id = requiredPositive(root, "id", "table id");
  const name = required(root, "name", "table name");
  const displayName = required(root, "displayName", "table displayName");
  const range = tableRange(required(root, "ref", "table ref"), "table range");
  const headerRowCount = optionalUnsigned(root, "headerRowCount", "header row count") ?? 1;
  const totalsRowCount = optionalUnsigned(root, "totalsRowCount", "totals row count") ?? 0;
  if (headerRowCount > 1 || headerRowCount + totalsRowCount > range.end.row - range.start.row + 1) {
    invalid("A table has invalid header or totals row bounds.");
  }
  const columnContainers = children(root, namespace, "tableColumns");
  if (columnContainers.length !== 1) invalid("A table must contain exactly one tableColumns element.");
  const columnElements = children(columnContainers[0]!, namespace, "tableColumn");
  const declaredCount = optionalUnsigned(columnContainers[0]!, "count", "table column count");
  const rangeWidth = range.end.column - range.start.column + 1;
  if ((declaredCount !== undefined && declaredCount !== columnElements.length) || columnElements.length !== rangeWidth) {
    invalid("A table's column count must match its range width.");
  }
  const columnIds = new Set<number>();
  const columns = columnElements.map((element) => {
    const column = Object.freeze({
      id: requiredPositive(element, "id", "table column id"),
      name: required(element, "name", "table column name"),
      totalsRowLabel: attr(element, "totalsRowLabel"),
      totalsRowFunction: attr(element, "totalsRowFunction"),
    });
    if (columnIds.has(column.id)) invalid(`Table column id ${column.id} is repeated.`);
    columnIds.add(column.id);
    return column;
  });
  const styles = children(root, namespace, "tableStyleInfo");
  if (styles.length > 1) invalid("A table must not repeat tableStyleInfo.");
  const styleElement = styles[0];
  const style = styleElement === undefined ? undefined : Object.freeze({
    name: attr(styleElement, "name"),
    showFirstColumn: booleanAttr(styleElement, "showFirstColumn", false),
    showLastColumn: booleanAttr(styleElement, "showLastColumn", false),
    showRowStripes: booleanAttr(styleElement, "showRowStripes", false),
    showColumnStripes: booleanAttr(styleElement, "showColumnStripes", false),
  });
  return Object.freeze({
    id,
    name,
    displayName,
    range,
    headerRowCount,
    totalsRowCount,
    columns: Object.freeze(columns),
    style,
    autoFilter: parseSpreadsheetAutoFilter(root, namespace),
    relationshipId,
    partName: part.name,
  });
}

function parseCriteria(parent: LosslessXmlElement, namespace: string): SpreadsheetFilterCriteria | undefined {
  const elements = parent.children.filter((child): child is LosslessXmlElement => child.kind === "element" && child.namespaceUri === namespace);
  if (elements.length === 0) return undefined;
  if (elements.length > 1) invalid("A filterColumn must not contain multiple filter criteria elements.");
  const element = elements[0]!;
  if (element.localName === "filters") {
    return Object.freeze({
      kind: "values" as const,
      values: Object.freeze(children(element, namespace, "filter").map((filter) => required(filter, "val", "filter value"))),
      includeBlank: booleanAttr(element, "blank", false),
    });
  }
  if (element.localName === "customFilters") {
    const conditions = children(element, namespace, "customFilter").map((condition) => {
      const operator = attr(condition, "operator") ?? "equal";
      if (!CUSTOM_OPERATORS.has(operator as SpreadsheetCustomFilterOperator)) invalid(`Custom filter operator ${JSON.stringify(operator)} is invalid.`);
      return Object.freeze({ operator: operator as SpreadsheetCustomFilterOperator, value: required(condition, "val", "custom filter value") });
    });
    if (conditions.length === 0 || conditions.length > 2) invalid("customFilters must contain one or two customFilter conditions.");
    return Object.freeze({ kind: "custom" as const, join: booleanAttr(element, "and", false) ? "and" as const : "or" as const, conditions: Object.freeze(conditions) });
  }
  return Object.freeze({ kind: "unsupported" as const, element: element.localName });
}

function parseSortState(element: LosslessXmlElement | undefined, namespace: string): SpreadsheetSortState | undefined {
  if (element === undefined) return undefined;
  const range = tableRange(required(element, "ref", "sortState ref"), "sort range");
  const conditions = children(element, namespace, "sortCondition").map((condition) => {
    const sortBy = attr(condition, "sortBy") ?? "value";
    if (sortBy !== "value" && sortBy !== "cellColor" && sortBy !== "fontColor" && sortBy !== "icon") invalid(`Sort method ${JSON.stringify(sortBy)} is invalid.`);
    return Object.freeze({
      range: tableRange(required(condition, "ref", "sortCondition ref"), "sort condition range"),
      descending: booleanAttr(condition, "descending", false),
      sortBy,
    });
  });
  return Object.freeze({
    range,
    caseSensitive: booleanAttr(element, "caseSensitive", false),
    columnSort: booleanAttr(element, "columnSort", false),
    conditions: Object.freeze(conditions),
  });
}

const CUSTOM_OPERATORS = new Set<SpreadsheetCustomFilterOperator>([
  "equal", "notEqual", "lessThan", "lessThanOrEqual", "greaterThan", "greaterThanOrEqual",
]);

function tableRange(raw: string, context: string): CellRange {
  if (!/^\$?[A-Za-z]{1,3}\$?[1-9][0-9]*(?::\$?[A-Za-z]{1,3}\$?[1-9][0-9]*)?$/.test(raw)) invalid(`${context} ${JSON.stringify(raw)} is invalid.`);
  try {
    return parseCellRange(raw.replaceAll("$", ""));
  } catch (cause) {
    throw new SpreadsheetError("invalid_table", `${context} ${JSON.stringify(raw)} is invalid.`, { cause });
  }
}

function children(parent: LosslessXmlElement, namespace: string, name: string): LosslessXmlElement[] {
  return parent.children.filter((child): child is LosslessXmlElement => child.kind === "element" && child.namespaceUri === namespace && child.localName === name);
}

function attr(element: LosslessXmlElement, name: string): string | undefined {
  return element.attributes.find((candidate) => candidate.namespaceUri === "" && candidate.localName === name)?.value;
}

function qualifiedAttr(element: LosslessXmlElement, namespace: string, name: string): string | undefined {
  return element.attributes.find((candidate) => candidate.namespaceUri === namespace && candidate.localName === name)?.value;
}

function required(element: LosslessXmlElement, name: string, context: string): string {
  const value = attr(element, name);
  if (value === undefined || value.length === 0) invalid(`A ${context} is required.`);
  return value;
}

function requiredPositive(element: LosslessXmlElement, name: string, context: string): number {
  const value = unsigned(required(element, name, context), context);
  if (value === 0) invalid(`${context} must be positive.`);
  return value;
}

function optionalUnsigned(element: LosslessXmlElement, name: string, context: string): number | undefined {
  const value = attr(element, name);
  return value === undefined ? undefined : unsigned(value, context);
}

function unsigned(raw: string, context: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/.test(raw)) invalid(`${context} must be an unsigned integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > 0xffffffff) invalid(`${context} is outside the unsigned integer range.`);
  return value;
}

function booleanAttr(element: LosslessXmlElement, name: string, fallback: boolean): boolean {
  const value = attr(element, name);
  if (value === undefined) return fallback;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  invalid(`${name} must be an XML boolean.`);
}

function invalid(message: string): never {
  throw new SpreadsheetError("invalid_table", message);
}
