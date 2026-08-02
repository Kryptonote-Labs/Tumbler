import type { LosslessXmlDocument, LosslessXmlElement } from "@tumbler/ooxml";
import { OOXML_NAMESPACES, parseLosslessXml } from "@tumbler/ooxml";
import type { OpcPart } from "@tumbler/opc";
import { SparseAxisGeometry } from "@tumbler/core";
import {
  EXCEL_MAX_COLUMNS,
  EXCEL_MAX_ROWS,
  formatCellReference,
  parseCellReference,
  parseCellRange,
  type CellAddress,
  type CellRange,
} from "./references.ts";
import { readSharedStrings, richText, type SharedStringTable } from "./shared-strings.ts";
import { formatSpreadsheetCellValue } from "./number-format.ts";
import { readSpreadsheetStyles, type SpreadsheetCellFormat, type SpreadsheetStyles } from "./styles.ts";
import { SpreadsheetError, type SpreadsheetSheet, type SpreadsheetWorkbook } from "./workbook.ts";
import { parseSpreadsheetAutoFilter, readSpreadsheetTables, type SpreadsheetAutoFilter, type SpreadsheetTable } from "./tables.ts";

export type SpreadsheetCellValue =
  | { readonly type: "blank" }
  | { readonly type: "boolean"; readonly value: boolean }
  | { readonly type: "date"; readonly value: string }
  | { readonly type: "error"; readonly value: string }
  | { readonly type: "number"; readonly value: number; readonly lexical: string }
  | { readonly type: "string"; readonly value: string; readonly storage: "inline" | "shared" | "formula" };

export interface SpreadsheetCell {
  readonly reference: string;
  readonly address: CellAddress;
  readonly styleIndex: number | undefined;
  readonly formula: string | undefined;
  readonly value: SpreadsheetCellValue;
}

export interface SpreadsheetRow {
  readonly index: number;
  readonly height: number | undefined;
  readonly hidden: boolean;
  readonly styleIndex: number | undefined;
  readonly customFormat: boolean;
  readonly cells: readonly SpreadsheetCell[];
}

export interface SpreadsheetColumn {
  readonly min: number;
  readonly max: number;
  readonly width: number | undefined;
  readonly hidden: boolean;
  readonly customWidth: boolean;
  readonly styleIndex: number | undefined;
}

export interface SpreadsheetPane {
  readonly workbookViewId: number;
  readonly xSplit: number;
  readonly ySplit: number;
  readonly topLeftCell: CellAddress | undefined;
  readonly activePane: "bottomLeft" | "bottomRight" | "topLeft" | "topRight" | undefined;
  readonly state: "frozen" | "frozenSplit" | "split";
}

export class SpreadsheetWorksheet {
  readonly workbook: SpreadsheetWorkbook;
  readonly sheet: SpreadsheetSheet;
  readonly part: OpcPart;
  readonly document: LosslessXmlDocument;
  readonly dimension: CellRange | undefined;
  readonly rows: readonly SpreadsheetRow[];
  readonly columns: readonly SpreadsheetColumn[];
  readonly merges: readonly CellRange[];
  readonly panes: readonly SpreadsheetPane[];
  readonly tables: readonly SpreadsheetTable[];
  readonly autoFilter: SpreadsheetAutoFilter | undefined;
  readonly styles: SpreadsheetStyles;
  readonly defaultRowHeight: number;
  readonly defaultColumnWidth: number;
  readonly #cells: ReadonlyMap<string, SpreadsheetCell>;
  readonly #rows: ReadonlyMap<number, SpreadsheetRow>;
  readonly #automaticRowHeights: ReadonlyMap<number, number>;

  constructor(input: {
    workbook: SpreadsheetWorkbook;
    sheet: SpreadsheetSheet;
    part: OpcPart;
    document: LosslessXmlDocument;
    dimension: CellRange | undefined;
    rows: readonly SpreadsheetRow[];
    columns: readonly SpreadsheetColumn[];
    merges: readonly CellRange[];
    panes: readonly SpreadsheetPane[];
    tables: readonly SpreadsheetTable[];
    autoFilter: SpreadsheetAutoFilter | undefined;
    styles: SpreadsheetStyles;
    defaultRowHeight: number;
    defaultColumnWidth: number;
  }) {
    this.workbook = input.workbook;
    this.sheet = input.sheet;
    this.part = input.part;
    this.document = input.document;
    this.dimension = input.dimension;
    this.rows = Object.freeze([...input.rows]);
    this.columns = Object.freeze([...input.columns]);
    this.merges = Object.freeze([...input.merges]);
    this.panes = Object.freeze([...input.panes]);
    this.tables = Object.freeze([...input.tables]);
    this.autoFilter = input.autoFilter;
    this.styles = input.styles;
    this.defaultRowHeight = input.defaultRowHeight;
    this.defaultColumnWidth = input.defaultColumnWidth;
    this.#cells = new Map(input.rows.flatMap((row) => row.cells.map((cell) => [cell.reference, cell] as const)));
    this.#rows = new Map(input.rows.map((row) => [row.index, row]));
    this.#automaticRowHeights = this.calculateAutomaticRowHeights();
  }

  cell(reference: string | CellAddress): SpreadsheetCell | undefined {
    const normalized = typeof reference === "string"
      ? formatCellReference(parseCellReference(reference))
      : formatCellReference(reference);
    return this.#cells.get(normalized);
  }

  cellStyle(reference: string | CellAddress): SpreadsheetCellFormat {
    const address = typeof reference === "string" ? parseCellReference(reference) : reference;
    return this.styles.resolve(this.effectiveStyleIndex(address));
  }

  effectiveStyleIndex(reference: string | CellAddress): number | undefined {
    const address = typeof reference === "string" ? parseCellReference(reference) : reference;
    const cellStyle = this.cell(address)?.styleIndex;
    if (cellStyle !== undefined) return cellStyle;
    const row = this.#rows.get(address.row);
    if (row?.customFormat === true) return row.styleIndex ?? 0;
    return this.columns.findLast((column) =>
      address.column >= column.min && address.column <= column.max && column.styleIndex !== undefined
    )?.styleIndex;
  }

  mergedRange(reference: string | CellAddress): CellRange | undefined {
    const address = typeof reference === "string" ? parseCellReference(reference) : reference;
    return this.merges.find((range) =>
      address.row >= range.start.row && address.row <= range.end.row &&
      address.column >= range.start.column && address.column <= range.end.column
    );
  }

  displayText(reference: string | CellAddress, locale = "en-US"): string {
    return this.formatValue(reference, this.cell(reference)?.value, locale);
  }

  formatValue(reference: string | CellAddress, value: SpreadsheetCellValue | undefined, locale = "en-US"): string {
    const style = this.styles.resolve(this.effectiveStyleIndex(reference));
    return formatSpreadsheetCellValue(value, {
      numberFormatId: style.numberFormatId,
      ...(style.numberFormatCode === undefined ? {} : { numberFormatCode: style.numberFormatCode }),
      dateSystem: this.workbook.dateSystem,
      locale,
    });
  }

  rowGeometry(count = EXCEL_MAX_ROWS, projectedRows: ReadonlyMap<number, number | undefined> = new Map()): SparseAxisGeometry {
    const rows = new Map(this.rows
      .filter((row) => row.index <= count && (row.hidden || row.height !== undefined))
      .map((row) => [row.index, row.hidden ? 0 : rowHeightToPixels(row.height ?? this.defaultRowHeight)]));
    for (const [index, height] of this.#automaticRowHeights) {
      if (index <= count) rows.set(index, rowHeightToPixels(height));
    }
    for (const [visualRow, sourceRow] of projectedRows) {
      if (visualRow < 1 || visualRow > count) continue;
      if (sourceRow === undefined) rows.set(visualRow, 0);
      else {
        const source = this.#rows.get(sourceRow);
        const height = source?.height ?? this.#automaticRowHeights.get(sourceRow) ?? this.defaultRowHeight;
        rows.set(visualRow, rowHeightToPixels(height));
      }
    }
    return new SparseAxisGeometry(count, rowHeightToPixels(this.defaultRowHeight),
      [...rows].map(([index, size]) => ({ index, size })));
  }

  columnGeometry(count = EXCEL_MAX_COLUMNS, maximumDigitWidth = 7): SparseAxisGeometry {
    const overrides = new Map<number, number>();
    for (const column of this.columns) {
      for (let index = column.min; index <= Math.min(column.max, count); index += 1) {
        overrides.set(index, column.hidden ? 0 : columnWidthToPixels(column.width ?? this.defaultColumnWidth, maximumDigitWidth));
      }
    }
    return new SparseAxisGeometry(count, columnWidthToPixels(this.defaultColumnWidth, maximumDigitWidth),
      [...overrides].map(([index, size]) => ({ index, size })));
  }

  private calculateAutomaticRowHeights(): ReadonlyMap<number, number> {
    const normalFontSize = this.styles.resolve(0).font.size ?? 11;
    const normalLeading = Math.max(0, this.defaultRowHeight - normalFontSize);
    const heights = new Map<number, number>();
    for (const row of this.rows) {
      if (row.hidden || row.height !== undefined) continue;
      let height = this.defaultRowHeight;
      if (row.customFormat) {
        const fontSize = this.styles.cellFormats[row.styleIndex ?? 0]?.font.size ?? normalFontSize;
        height = Math.max(height, fontSize + normalLeading);
      }
      for (const cell of row.cells) {
        const style = this.styles.cellFormats[this.effectiveStyleIndex(cell.address) ?? 0];
        if (style === undefined) continue;
        const fontSize = style.font.size ?? normalFontSize;
        const lines = style.alignment.wrapText ? hardLineCount(cell.value) : 1;
        height = Math.max(height, (fontSize + normalLeading) * lines);
      }
      if (height > this.defaultRowHeight) heights.set(row.index, height);
    }
    return heights;
  }
}

/** Projects SpreadsheetML point heights onto Excel's integer 96-DPI pixel grid. */
export function rowHeightToPixels(points: number): number {
  if (!Number.isFinite(points) || points < 0) throw new RangeError("Row height must be a finite non-negative measurement.");
  return Math.round(points * 4 / 3);
}

export function openWorksheet(workbook: SpreadsheetWorkbook, sheet: SpreadsheetSheet): SpreadsheetWorksheet {
  if (!workbook.sheets.includes(sheet)) throw new TypeError("The sheet does not belong to this workbook.");
  const part = workbook.package.getPart(sheet.partName);
  if (part === undefined) throw new SpreadsheetError("invalid_worksheet", `Worksheet part ${JSON.stringify(sheet.partName.value)} is missing.`);
  let document: LosslessXmlDocument;
  try {
    document = parseLosslessXml(workbook.package.readPart(part));
  } catch (cause) {
    throw new SpreadsheetError("invalid_worksheet", `Worksheet ${JSON.stringify(sheet.name)} is not valid XML.`, { cause });
  }
  const namespace = workbook.conformance === "strict"
    ? OOXML_NAMESPACES.strict.spreadsheet
    : OOXML_NAMESPACES.transitional.spreadsheet;
  if (document.root.namespaceUri !== namespace || document.root.localName !== "worksheet") {
    throw new SpreadsheetError("invalid_worksheet", "A Worksheet part must have a SpreadsheetML worksheet root element.");
  }
  const sheetFormat = parseSheetFormat(document.root, namespace);
  const relationshipsNamespace = workbook.conformance === "strict"
    ? "http://purl.oclc.org/ooxml/officeDocument/relationships"
    : "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  return new SpreadsheetWorksheet({
    workbook,
    sheet,
    part,
    document,
    dimension: parseDimension(document.root, namespace),
    columns: parseColumns(document.root, namespace),
    rows: parseRows(document, namespace, readSharedStrings(workbook)),
    merges: parseMerges(document.root, namespace),
    panes: parsePanes(document.root, namespace),
    tables: readSpreadsheetTables({ workbook, worksheetPart: part, worksheetRoot: document.root, spreadsheetNamespace: namespace, relationshipsNamespace }),
    autoFilter: parseSpreadsheetAutoFilter(document.root, namespace),
    styles: readSpreadsheetStyles(workbook),
    defaultRowHeight: sheetFormat.defaultRowHeight,
    defaultColumnWidth: sheetFormat.defaultColumnWidth,
  });
}

/** ECMA-376 §18.3.1.13 runtime pixel conversion at the supplied maximum digit width. */
export function columnWidthToPixels(width: number, maximumDigitWidth = 7): number {
  if (!Number.isFinite(width) || width < 0 || !Number.isFinite(maximumDigitWidth) || maximumDigitWidth <= 0) {
    throw new RangeError("Column width and maximum digit width must be finite positive measurements.");
  }
  return Math.floor(((256 * width + Math.floor(128 / maximumDigitWidth)) / 256) * maximumDigitWidth);
}

function parseSheetFormat(root: LosslessXmlElement, namespace: string): { defaultRowHeight: number; defaultColumnWidth: number } {
  const formats = children(root, namespace, "sheetFormatPr");
  if (formats.length > 1) throw new SpreadsheetError("invalid_worksheet", "A worksheet must not repeat sheetFormatPr.");
  const format = formats[0];
  const rawRowHeight = format === undefined ? undefined : attr(format, "defaultRowHeight");
  const rawColumnWidth = format === undefined ? undefined : attr(format, "defaultColWidth");
  const defaultRowHeight = rawRowHeight === undefined ? 15 : nonNegativeDouble(rawRowHeight, "default row height");
  const defaultColumnWidth = rawColumnWidth === undefined ? 8.43 : nonNegativeDouble(rawColumnWidth, "default column width");
  if (defaultRowHeight === 0 || defaultColumnWidth === 0) {
    throw new SpreadsheetError("invalid_worksheet", "Default row and column measurements must be positive.");
  }
  return {
    defaultRowHeight,
    defaultColumnWidth,
  };
}

function parseRows(document: LosslessXmlDocument, namespace: string, strings: SharedStringTable | undefined): SpreadsheetRow[] {
  const sheetData = children(document.root, namespace, "sheetData");
  if (sheetData.length !== 1) throw new SpreadsheetError("invalid_worksheet", "A worksheet must contain exactly one sheetData element.");
  const rows: SpreadsheetRow[] = [];
  const seenRows = new Set<number>();
  let previousRow = 0;
  for (const rowElement of children(sheetData[0]!, namespace, "row")) {
    const rawIndex = attr(rowElement, "r");
    const index = rawIndex === undefined ? previousRow + 1 : gridInteger(rawIndex, EXCEL_MAX_ROWS, "row index");
    if (seenRows.has(index)) throw new SpreadsheetError("invalid_worksheet", `Worksheet contains duplicate row ${index}.`);
    seenRows.add(index);
    previousRow = index;
    const cells: SpreadsheetCell[] = [];
    const seenCells = new Set<string>();
    let previousColumn = 0;
    for (const cellElement of children(rowElement, namespace, "c")) {
      const rawReference = attr(cellElement, "r");
      const address = rawReference === undefined
        ? { row: index, column: previousColumn + 1 }
        : cellReference(rawReference);
      if (address.row !== index || address.column > EXCEL_MAX_COLUMNS) {
        throw new SpreadsheetError("invalid_cell", `Cell ${JSON.stringify(rawReference)} does not belong to row ${index}.`);
      }
      const reference = formatCellReference(address);
      if (seenCells.has(reference)) throw new SpreadsheetError("invalid_cell", `Worksheet contains duplicate cell ${reference}.`);
      seenCells.add(reference);
      previousColumn = address.column;
      cells.push(parseCell(document, cellElement, namespace, reference, address, strings));
    }
    const rawHeight = attr(rowElement, "ht");
    const rawStyle = attr(rowElement, "s");
    rows.push(Object.freeze({
      index,
      height: rawHeight === undefined ? undefined : nonNegativeDouble(rawHeight, "row height"),
      hidden: xmlBoolean(attr(rowElement, "hidden"), false, "row hidden"),
      styleIndex: rawStyle === undefined ? undefined : unsignedInteger(rawStyle, "row style index"),
      customFormat: xmlBoolean(attr(rowElement, "customFormat"), false, "row customFormat"),
      cells: Object.freeze(cells),
    }));
  }
  return rows;
}

function parseCell(
  document: LosslessXmlDocument,
  element: LosslessXmlElement,
  namespace: string,
  reference: string,
  address: CellAddress,
  strings: SharedStringTable | undefined,
): SpreadsheetCell {
  const formulas = children(element, namespace, "f");
  const values = children(element, namespace, "v");
  const inlineStrings = children(element, namespace, "is");
  if (formulas.length > 1 || values.length > 1 || inlineStrings.length > 1) {
    throw new SpreadsheetError("invalid_cell", `Cell ${reference} repeats a formula, value, or inline string.`);
  }
  const type = attr(element, "t") ?? "n";
  const formula = formulas[0] === undefined ? undefined : document.textContent(formulas[0]);
  const rawValue = values[0] === undefined ? undefined : document.textContent(values[0]);
  let value: SpreadsheetCellValue;
  switch (type) {
    case "inlineStr":
      if (formula !== undefined || rawValue !== undefined || inlineStrings.length !== 1) {
        throw new SpreadsheetError("invalid_cell", `Inline string cell ${reference} must contain only one is element.`);
      }
      value = { type: "string", value: richText(inlineStrings[0]!, namespace, document.textContent.bind(document)), storage: "inline" };
      break;
    case "s": {
      if (rawValue === undefined || !/^(?:0|[1-9][0-9]*)$/.test(rawValue)) {
        throw new SpreadsheetError("invalid_cell", `Shared string cell ${reference} has an invalid index.`);
      }
      const index = Number(rawValue);
      const text = strings?.get(index);
      if (text === undefined) throw new SpreadsheetError("missing_shared_string", `Cell ${reference} references missing shared string ${index}.`);
      value = { type: "string", value: text, storage: "shared" };
      break;
    }
    case "str":
      value = rawValue === undefined ? { type: "blank" } : { type: "string", value: rawValue, storage: "formula" };
      break;
    case "b":
      value = rawValue === undefined ? { type: "blank" } : { type: "boolean", value: xmlBoolean(rawValue, false, `cell ${reference}`) };
      break;
    case "e":
      value = rawValue === undefined ? { type: "blank" } : { type: "error", value: rawValue };
      break;
    case "d":
      value = rawValue === undefined ? { type: "blank" } : { type: "date", value: rawValue };
      break;
    case "n": {
      // Producers commonly emit an empty v element when a formula has not been calculated yet.
      if (rawValue === undefined || (formula !== undefined && rawValue === "")) value = { type: "blank" };
      else {
        const number = Number(rawValue);
        if (!Number.isFinite(number) || rawValue.trim() === "") throw new SpreadsheetError("invalid_cell", `Cell ${reference} does not contain a finite number.`);
        value = { type: "number", value: number, lexical: rawValue };
      }
      break;
    }
    default:
      throw new SpreadsheetError("invalid_cell", `Cell ${reference} has unsupported type ${JSON.stringify(type)}.`);
  }
  const rawStyle = attr(element, "s");
  return Object.freeze({
    reference,
    address: Object.freeze({ ...address }),
    styleIndex: rawStyle === undefined ? undefined : unsignedInteger(rawStyle, "style index"),
    formula,
    value: Object.freeze(value),
  });
}

function hardLineCount(value: SpreadsheetCellValue): number {
  if (value.type !== "string") return 1;
  return value.value.split(/\r\n|\r|\n/).length;
}

function parseDimension(root: LosslessXmlElement, namespace: string): CellRange | undefined {
  const dimensions = children(root, namespace, "dimension");
  if (dimensions.length > 1) throw new SpreadsheetError("invalid_worksheet", "A worksheet must not repeat its dimension.");
  const raw = dimensions[0] === undefined ? undefined : attr(dimensions[0], "ref");
  if (dimensions[0] !== undefined && raw === undefined) throw new SpreadsheetError("invalid_worksheet", "Worksheet dimension is missing its ref.");
  return raw === undefined ? undefined : cellRange(raw, "worksheet dimension");
}

function parseColumns(root: LosslessXmlElement, namespace: string): SpreadsheetColumn[] {
  const result: SpreadsheetColumn[] = [];
  for (const container of children(root, namespace, "cols")) {
    for (const column of children(container, namespace, "col")) {
      const rawMin = attr(column, "min");
      const rawMax = attr(column, "max");
      if (rawMin === undefined || rawMax === undefined) throw new SpreadsheetError("invalid_worksheet", "Column information requires min and max.");
      const min = gridInteger(rawMin, EXCEL_MAX_COLUMNS, "column min");
      const max = gridInteger(rawMax, EXCEL_MAX_COLUMNS, "column max");
      if (max < min) throw new SpreadsheetError("invalid_worksheet", "Column information has reversed bounds.");
      const rawWidth = attr(column, "width");
      const rawStyle = attr(column, "style");
      result.push(Object.freeze({
        min,
        max,
        width: rawWidth === undefined ? undefined : nonNegativeDouble(rawWidth, "column width"),
        hidden: xmlBoolean(attr(column, "hidden"), false, "column hidden"),
        customWidth: xmlBoolean(attr(column, "customWidth"), false, "column customWidth"),
        styleIndex: rawStyle === undefined ? undefined : unsignedInteger(rawStyle, "column style index"),
      }));
    }
  }
  return result;
}

function parseMerges(root: LosslessXmlElement, namespace: string): CellRange[] {
  const result: CellRange[] = [];
  for (const container of children(root, namespace, "mergeCells")) {
    for (const merge of children(container, namespace, "mergeCell")) {
      const raw = attr(merge, "ref");
      if (raw === undefined) throw new SpreadsheetError("invalid_worksheet", "A merged cell is missing its ref.");
      const range = cellRange(raw, "merged cell");
      if (result.some((existing) => overlap(existing, range))) {
        throw new SpreadsheetError("invalid_worksheet", `Merged range ${raw} overlaps another merged range.`);
      }
      result.push(range);
    }
  }
  return result;
}

function parsePanes(root: LosslessXmlElement, namespace: string): SpreadsheetPane[] {
  const result: SpreadsheetPane[] = [];
  for (const views of children(root, namespace, "sheetViews")) {
    for (const view of children(views, namespace, "sheetView")) {
      const rawViewId = attr(view, "workbookViewId");
      if (rawViewId === undefined) throw new SpreadsheetError("invalid_worksheet", "A sheet view requires workbookViewId.");
      for (const pane of children(view, namespace, "pane")) {
        const state = attr(pane, "state") ?? "split";
        if (state !== "frozen" && state !== "frozenSplit" && state !== "split") {
          throw new SpreadsheetError("invalid_worksheet", "A worksheet pane has an invalid state.");
        }
        const activePane = attr(pane, "activePane");
        if (activePane !== undefined && !["bottomLeft", "bottomRight", "topLeft", "topRight"].includes(activePane)) {
          throw new SpreadsheetError("invalid_worksheet", "A worksheet pane has an invalid active pane.");
        }
        const rawTopLeft = attr(pane, "topLeftCell");
        result.push(Object.freeze({
          workbookViewId: unsignedInteger(rawViewId, "workbookViewId"),
          xSplit: optionalDouble(attr(pane, "xSplit"), "pane xSplit"),
          ySplit: optionalDouble(attr(pane, "ySplit"), "pane ySplit"),
          topLeftCell: rawTopLeft === undefined ? undefined : cellReference(rawTopLeft),
          activePane: activePane as SpreadsheetPane["activePane"],
          state,
        }));
      }
    }
  }
  return result;
}

function children(parent: LosslessXmlElement, namespace: string, name: string): LosslessXmlElement[] {
  return parent.children.filter((child): child is LosslessXmlElement =>
    child.kind === "element" && child.namespaceUri === namespace && child.localName === name
  );
}

function attr(element: LosslessXmlElement, name: string): string | undefined {
  return element.attributes.find((candidate) => candidate.namespaceUri === "" && candidate.localName === name)?.value;
}

function cellReference(raw: string): CellAddress {
  try {
    return parseCellReference(raw);
  } catch (cause) {
    throw new SpreadsheetError("invalid_cell", `Invalid cell reference ${JSON.stringify(raw)}.`, { cause });
  }
}

function cellRange(raw: string, context: string): CellRange {
  try {
    return parseCellRange(raw);
  } catch (cause) {
    throw new SpreadsheetError("invalid_worksheet", `Invalid ${context} ${JSON.stringify(raw)}.`, { cause });
  }
}

function gridInteger(raw: string, maximum: number, context: string): number {
  const value = unsignedInteger(raw, context);
  if (value < 1 || value > maximum) throw new SpreadsheetError("invalid_worksheet", `${context} is outside the worksheet grid.`);
  return value;
}

function unsignedInteger(raw: string, context: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/.test(raw)) throw new SpreadsheetError("invalid_worksheet", `${context} must be an unsigned integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > 0xffffffff) throw new SpreadsheetError("invalid_worksheet", `${context} is outside the unsigned integer range.`);
  return value;
}

function optionalDouble(raw: string | undefined, context: string): number {
  return raw === undefined ? 0 : nonNegativeDouble(raw, context);
}

function nonNegativeDouble(raw: string, context: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || raw.trim() === "") throw new SpreadsheetError("invalid_worksheet", `${context} must be a non-negative finite number.`);
  return value;
}

function xmlBoolean(raw: string | undefined, defaultValue: boolean, context: string): boolean {
  if (raw === undefined) return defaultValue;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  throw new SpreadsheetError("invalid_worksheet", `${context} must be an XML boolean.`);
}

function overlap(left: CellRange, right: CellRange): boolean {
  return left.start.row <= right.end.row && right.start.row <= left.end.row &&
    left.start.column <= right.end.column && right.start.column <= left.end.column;
}
