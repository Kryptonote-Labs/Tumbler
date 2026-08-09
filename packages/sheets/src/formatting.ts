import {
  normalizeFormattingPatch,
  type FormattingCapabilities,
  type FormattingChange,
  type FormattingPatch,
  type FormattingState,
  type FormattingValue,
  type HorizontalAlignment,
  type OfficeColor,
  type TextUnderline,
  type VerticalAlignment,
} from "@tumblerjs/core";
import {
  beginLosslessXmlEdit,
  encodeXmlSource,
  parseLosslessXml,
  type LosslessXmlAttribute,
  type LosslessXmlDocument,
  type LosslessXmlElement,
  type LosslessXmlNode,
} from "@tumblerjs/ooxml";
import { beginPackageTransaction, PartName } from "@tumblerjs/opc";
import { formatCellReference, parseCellRange, type CellAddress, type CellRange } from "./references.ts";
import {
  readSpreadsheetStyles,
  type SpreadsheetAlignment,
  type SpreadsheetCellFormat,
  type SpreadsheetColor,
  type SpreadsheetFont,
  type SpreadsheetStyles,
} from "./styles.ts";
import { openWorksheet, type SpreadsheetWorksheet } from "./worksheet.ts";
import { SpreadsheetError, type SpreadsheetSheet, type SpreadsheetWorkbook } from "./workbook.ts";

const STYLES_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml";
export const MAX_FORMATTED_CELLS = 100_000;

export const SPREADSHEET_FORMATTING_CAPABILITIES: FormattingCapabilities = Object.freeze({
  text: Object.freeze({
    fontSize: Object.freeze({ minimum: 1, maximum: 409 }),
    fontFamily: true,
    bold: true,
    italic: true,
    underline: Object.freeze(["none", "single", "double"] as const),
    color: true,
  }),
  block: Object.freeze({
    horizontalAlignment: Object.freeze(["start", "center", "end", "justify"] as const),
    verticalAlignment: Object.freeze(["top", "center", "bottom"] as const),
  }),
});

export type SpreadsheetFormattingTarget = string | CellRange;

/** Reads effective formatting across a range without exposing SpreadsheetML style indexes. */
export function spreadsheetFormattingState(
  worksheet: SpreadsheetWorksheet,
  target: SpreadsheetFormattingTarget,
): FormattingState {
  const range = normalizeRange(target);
  validateRangeSize(range);
  const formats = cells(range).map((address) => worksheet.cellStyle(address));
  const styles = worksheet.styles;
  const fonts = formats.map((format) => format.font);
  const alignments = formats.map((format) => format.alignment);
  return Object.freeze({
    text: Object.freeze({
      fontSize: combine(fonts.map((font) => font.size), numberValue),
      fontFamily: combine(fonts.map((font) => styles.resolveFontName(font)), stringValue),
      bold: combine(fonts.map((font) => font.bold), directValue),
      italic: combine(fonts.map((font) => font.italic), directValue),
      underline: combine(fonts.map((font) => spreadsheetUnderline(font.underline)), directValue),
      color: combine(fonts.map((font) => resolvedOfficeColor(styles, font.color)), directValue),
    }),
    block: Object.freeze({
      horizontalAlignment: combine(alignments.map((alignment) => officeHorizontalAlignment(alignment.horizontal)), directValue),
      verticalAlignment: combine(alignments.map((alignment) => officeVerticalAlignment(alignment.vertical)), directValue),
    }),
  });
}

/** Applies semantic formatting entirely in-memory and returns a new XLSX byte sequence. */
export function formatSpreadsheetCells(
  workbook: SpreadsheetWorkbook,
  sheet: SpreadsheetSheet,
  target: SpreadsheetFormattingTarget,
  input: FormattingPatch,
): Uint8Array {
  if (!workbook.sheets.includes(sheet)) throw new TypeError("The sheet does not belong to this workbook.");
  const range = normalizeRange(target);
  validateRangeSize(range);
  const patch = normalizeFormattingPatch(input);
  if (patch.text === undefined && patch.block === undefined) return workbook.package.archive.originalBytes();

  const worksheet = openWorksheet(workbook, sheet);
  const planner = new SpreadsheetStylePlanner(workbook, worksheet.styles);
  const edits = cells(range).map((address) => ({
    address,
    styleIndex: planner.formatIndex(worksheet.effectiveStyleIndex(address) ?? 0, patch),
  }));
  if (edits.every(({ address, styleIndex }) => styleIndex === (worksheet.effectiveStyleIndex(address) ?? 0))) {
    return workbook.package.archive.originalBytes();
  }

  const transaction = beginPackageTransaction(workbook.package);
  planner.stage(transaction);
  transaction.replacePart(sheet.partName, styleWorksheetCells(worksheet.document, workbook.conformance, edits));
  return transaction.commit();
}

class SpreadsheetStylePlanner {
  readonly workbook: SpreadsheetWorkbook;
  readonly source: SpreadsheetStyles;
  readonly fonts: SpreadsheetFont[];
  readonly formats: SpreadsheetCellFormat[];
  readonly initialFontCount: number;
  readonly initialFormatCount: number;

  constructor(workbook: SpreadsheetWorkbook, source = readSpreadsheetStyles(workbook)) {
    this.workbook = workbook;
    this.source = source;
    this.fonts = [...source.fonts];
    this.formats = [...source.cellFormats];
    this.initialFontCount = this.fonts.length;
    this.initialFormatCount = this.formats.length;
  }

  formatIndex(baseIndex: number, patch: FormattingPatch): number {
    const base = this.formats[baseIndex];
    if (base === undefined) throw new SpreadsheetError("invalid_styles", `Cell format index ${baseIndex} does not exist.`);
    const fallback = this.formats[0]!;
    const font = applyFontPatch(base.font, fallback.font, patch);
    const alignment = applyAlignmentPatch(base.alignment, fallback.alignment, patch);
    const format = Object.freeze({ ...base, font, alignment });
    const existing = this.formats.findIndex((candidate) => equal(candidate, format));
    if (existing >= 0) return existing;
    if (!this.fonts.some((candidate) => equal(candidate, font))) this.fonts.push(font);
    this.formats.push(format);
    return this.formats.length - 1;
  }

  stage(transaction: ReturnType<typeof beginPackageTransaction>): void {
    if (this.formats.length === this.initialFormatCount) return;
    const newFonts = uniqueNewFonts(this.fonts, this.initialFontCount);
    const fontIds = this.formats.map((format) => indexOf(this.fonts, format.font));
    const addedFormats = this.formats.slice(this.initialFormatCount);
    if (this.source.partName === undefined) {
      const partName = availableStylesPartName(this.workbook);
      transaction
        .addPart(partName, STYLES_CONTENT_TYPE, encodeXmlSource(serializeStyleSheet(this.workbook, this.fonts, this.formats), "utf-8", false))
        .addRelationship(this.workbook.part.name, {
          id: availableRelationshipId(this.workbook),
          type: stylesRelationshipType(this.workbook),
          target: partName,
        });
      return;
    }
    const part = this.workbook.package.getPart(this.source.partName)!;
    const document = parseLosslessXml(this.workbook.package.readPart(part));
    const namespace = spreadsheetNamespace(this.workbook.conformance);
    const fonts = child(document.root, namespace, "fonts");
    const cellXfs = child(document.root, namespace, "cellXfs");
    if (fonts === undefined || cellXfs === undefined) throw new SpreadsheetError("invalid_styles", "Editable styles require fonts and cellXfs collections.");
    const editor = beginLosslessXmlEdit(document);
    appendCollection(editor, document, fonts, newFonts.map(({ value }) => serializeFont(fonts.prefix, value)).join(""), this.fonts.length);
    appendCollection(
      editor,
      document,
      cellXfs,
      addedFormats.map((format, offset) => serializeCellFormat(
        cellXfs.prefix,
        format,
        fontIds[this.initialFormatCount + offset]!,
        indexOf(this.source.fills, format.fill),
        indexOf(this.source.borders, format.border),
      )).join(""),
      this.formats.length,
    );
    transaction.replacePart(this.source.partName, editor.commit().bytes);
  }
}

function applyFontPatch(base: SpreadsheetFont, fallback: SpreadsheetFont, patch: FormattingPatch): SpreadsheetFont {
  const text = patch.text;
  if (text === undefined) return base;
  const font = {
    ...base,
    size: changed(base.size, fallback.size, text.fontSize),
    bold: changed(base.bold, fallback.bold, text.bold),
    italic: changed(base.italic, fallback.italic, text.italic),
    underline: changed(base.underline, fallback.underline, text.underline, (value) => value === "none" ? undefined : value),
    color: changed(base.color, fallback.color, text.color, spreadsheetColor),
  };
  if (text.fontFamily !== undefined) {
    font.name = "inherit" in text.fontFamily ? fallback.name : text.fontFamily.set;
    font.scheme = "inherit" in text.fontFamily ? fallback.scheme : undefined;
  }
  return Object.freeze(font);
}

function applyAlignmentPatch(
  base: SpreadsheetAlignment,
  fallback: SpreadsheetAlignment,
  patch: FormattingPatch,
): SpreadsheetAlignment {
  const block = patch.block;
  if (block === undefined) return base;
  return Object.freeze({
    ...base,
    horizontal: changed(base.horizontal, fallback.horizontal, block.horizontalAlignment, spreadsheetHorizontalAlignment),
    vertical: changed(base.vertical, fallback.vertical, block.verticalAlignment, spreadsheetVerticalAlignment),
  });
}

function changed<TSource, TTarget = TSource>(
  current: TTarget,
  fallback: TTarget,
  change: FormattingChange<TSource> | undefined,
  convert: (value: TSource) => TTarget = (value) => value as unknown as TTarget,
): TTarget {
  if (change === undefined) return current;
  return "inherit" in change ? fallback : convert(change.set);
}

function spreadsheetColor(color: OfficeColor): SpreadsheetColor {
  return color.type === "automatic"
    ? Object.freeze({ type: "automatic", tint: 0 })
    : Object.freeze({ type: "rgb", argb: `FF${color.value.slice(1)}`, tint: 0 });
}

function spreadsheetHorizontalAlignment(value: HorizontalAlignment): string {
  return value === "start" ? "left" : value === "end" ? "right" : value;
}

function spreadsheetVerticalAlignment(value: VerticalAlignment): string {
  return value;
}

function officeHorizontalAlignment(value: string | undefined): HorizontalAlignment | undefined {
  return value === "left" ? "start" : value === "right" ? "end" :
    value === "center" || value === "justify" ? value : undefined;
}

function officeVerticalAlignment(value: string | undefined): VerticalAlignment | undefined {
  return value === "top" || value === "center" || value === "bottom" ? value : undefined;
}

function spreadsheetUnderline(value: string | undefined): TextUnderline | undefined {
  return value === undefined ? "none" : value === "single" || value === "double" ? value : undefined;
}

function resolvedOfficeColor(styles: SpreadsheetStyles, value: SpreadsheetColor | undefined): OfficeColor {
  const argb = styles.resolveColor(value);
  return argb === undefined
    ? Object.freeze({ type: "automatic" })
    : Object.freeze({ type: "rgb", value: `#${argb.slice(2)}` });
}

function combine<T, U>(values: readonly (T | undefined)[], present: (value: T) => FormattingValue<U>): FormattingValue<U> {
  if (values.length === 0) return Object.freeze({ state: "unavailable" });
  const first = values[0];
  if (values.some((value) => !equal(value, first))) return Object.freeze({ state: "mixed" });
  if (first === undefined) return Object.freeze({ state: "unavailable" });
  return present(first);
}

function directValue<T>(value: T): FormattingValue<T> {
  return Object.freeze({ state: "value", value });
}

function numberValue(value: number): FormattingValue<number> {
  return directValue(value);
}

function stringValue(value: string): FormattingValue<string> {
  return directValue(value);
}

function normalizeRange(target: SpreadsheetFormattingTarget): CellRange {
  const range = typeof target === "string" ? parseCellRange(target) : parseCellRange(`${formatCellReference(target.start)}:${formatCellReference(target.end)}`);
  return Object.freeze({
    start: Object.freeze({ row: Math.min(range.start.row, range.end.row), column: Math.min(range.start.column, range.end.column) }),
    end: Object.freeze({ row: Math.max(range.start.row, range.end.row), column: Math.max(range.start.column, range.end.column) }),
  });
}

function validateRangeSize(range: CellRange): void {
  const count = (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1);
  if (!Number.isSafeInteger(count) || count > MAX_FORMATTED_CELLS) {
    throw new RangeError(`A formatting operation cannot exceed ${MAX_FORMATTED_CELLS.toLocaleString("en-US")} cells.`);
  }
}

function cells(range: CellRange): CellAddress[] {
  const result: CellAddress[] = [];
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let column = range.start.column; column <= range.end.column; column += 1) result.push({ row, column });
  }
  return result;
}

function styleWorksheetCells(
  document: LosslessXmlDocument,
  conformance: "strict" | "transitional",
  edits: readonly { readonly address: CellAddress; readonly styleIndex: number }[],
): Uint8Array {
  const namespace = spreadsheetNamespace(conformance);
  const sheetData = child(document.root, namespace, "sheetData");
  if (sheetData === undefined) throw new SpreadsheetError("invalid_worksheet", "A worksheet must contain sheetData before it can be formatted.");
  const byRow = new Map<number, { readonly address: CellAddress; readonly styleIndex: number }[]>();
  for (const edit of edits) {
    const row = byRow.get(edit.address.row) ?? [];
    row.push(edit);
    byRow.set(edit.address.row, row);
  }
  const rows = children(sheetData, namespace, "row").map((element, index, all) => ({
    index: Number(attribute(element, "r")?.value ?? inferredRowIndex(all, index)),
    element,
  }));
  const editor = beginLosslessXmlEdit(document);
  const missing: { row: number; markup: string }[] = [];
  for (const [rowIndex, rowEdits] of byRow) {
    const row = rows.find((candidate) => candidate.index === rowIndex)?.element;
    if (row === undefined) {
      missing.push({ row: rowIndex, markup: serializeNewStyledRow(sheetData.prefix, rowIndex, rowEdits) });
    } else {
      editor.replaceElementMarkup(row, serializeStyledRow(document, row, namespace, rowEdits));
    }
  }
  if (missing.length > 0) {
    missing.sort((left, right) => left.row - right.row);
    if (sheetData.selfClosing) {
      const start = document.source.slice(sheetData.startTagSpan.start, sheetData.startTagSpan.end).replace(/\/\s*>$/, ">");
      editor.replaceElementMarkup(sheetData, `${start}${missing.map((item) => item.markup).join("")}</${sheetData.qualified}>`);
    } else {
      const groups = new Map<LosslessXmlElement | undefined, string[]>();
      for (const item of missing) {
        const next = rows.find((row) => row.index > item.row)?.element;
        const markup = groups.get(next) ?? [];
        markup.push(item.markup);
        groups.set(next, markup);
      }
      for (const [next, markup] of groups) {
        if (next === undefined) editor.appendMarkup(sheetData, markup.join(""));
        else editor.insertMarkupBefore(next, markup.join(""));
      }
    }
  }
  updateDimension(editor, document, namespace, sheetData, edits.map((edit) => edit.address));
  return editor.commit().bytes;
}

function serializeStyledRow(
  document: LosslessXmlDocument,
  row: LosslessXmlElement,
  namespace: string,
  edits: readonly { readonly address: CellAddress; readonly styleIndex: number }[],
): string {
  const editByColumn = new Map(edits.map((edit) => [edit.address.column, edit.styleIndex]));
  const existing = children(row, namespace, "c").map((cell, index, all) => ({
    column: parseCellColumn(cell, edits[0]!.address.row, index, all),
    markup: document.source.slice(cell.span.start, cell.span.end),
    element: cell,
  }));
  const byColumn = new Map(existing.map((cell) => [cell.column, cell]));
  const columns = [...new Set([...byColumn.keys(), ...editByColumn.keys()])].sort((left, right) => left - right);
  const cellsMarkup = columns.map((column) => {
    const source = byColumn.get(column);
    const styleIndex = editByColumn.get(column);
    return styleIndex === undefined ? source!.markup : source === undefined
      ? serializeNewStyledCell(row.prefix, { row: edits[0]!.address.row, column }, styleIndex)
      : setCellStyle(document, source.element, styleIndex);
  }).join("");
  const nonCells = row.children
    .filter((node) => node.kind !== "element" || node.namespaceUri !== namespace || node.localName !== "c")
    .map((node) => sourceForNode(document, node))
    .join("");
  const start = document.source.slice(row.startTagSpan.start, row.startTagSpan.end).replace(/\/\s*>$/, ">");
  return `${start}${cellsMarkup}${nonCells}</${row.qualified}>`;
}

function serializeNewStyledRow(
  prefix: string,
  row: number,
  edits: readonly { readonly address: CellAddress; readonly styleIndex: number }[],
): string {
  return `<${qualified(prefix, "row")} r="${row}">${[...edits]
    .sort((left, right) => left.address.column - right.address.column)
    .map((edit) => serializeNewStyledCell(prefix, edit.address, edit.styleIndex)).join("")}</${qualified(prefix, "row")}>`;
}

function serializeNewStyledCell(prefix: string, address: CellAddress, styleIndex: number): string {
  return `<${qualified(prefix, "c")} r="${formatCellReference(address)}" s="${styleIndex}"/>`;
}

function setCellStyle(document: LosslessXmlDocument, cell: LosslessXmlElement, styleIndex: number): string {
  let start = document.source.slice(cell.startTagSpan.start, cell.startTagSpan.end);
  const style = attribute(cell, "s");
  if (style === undefined) {
    const offset = start.search(/\/?>\s*$/);
    start = `${start.slice(0, offset)} s="${styleIndex}"${start.slice(offset)}`;
  } else {
    const relativeStart = style.valueSpan.start - cell.startTagSpan.start;
    const relativeEnd = style.valueSpan.end - cell.startTagSpan.start;
    start = `${start.slice(0, relativeStart)}${styleIndex}${start.slice(relativeEnd)}`;
  }
  return `${start}${document.source.slice(cell.startTagSpan.end, cell.span.end)}`;
}

function parseCellColumn(
  cell: LosslessXmlElement,
  row: number,
  index: number,
  siblings: readonly LosslessXmlElement[],
): number {
  const reference = attribute(cell, "r")?.value;
  if (reference !== undefined) return parseCellRange(reference).start.column;
  if (index === 0) return 1;
  return parseCellColumn(siblings[index - 1]!, row, index - 1, siblings) + 1;
}

function inferredRowIndex(rows: readonly LosslessXmlElement[], index: number): number {
  if (index === 0) return 1;
  return Number(attribute(rows[index - 1]!, "r")?.value ?? inferredRowIndex(rows, index - 1)) + 1;
}

function updateDimension(
  editor: ReturnType<typeof beginLosslessXmlEdit>,
  document: LosslessXmlDocument,
  namespace: string,
  sheetData: LosslessXmlElement,
  addresses: readonly CellAddress[],
): void {
  const dimension = child(document.root, namespace, "dimension");
  const previous = dimension === undefined || attribute(dimension, "ref") === undefined
    ? undefined
    : parseCellRange(attribute(dimension, "ref")!.value);
  const points = [...addresses, ...(previous === undefined ? [] : [previous.start, previous.end])];
  const range = {
    start: { row: Math.min(...points.map((point) => point.row)), column: Math.min(...points.map((point) => point.column)) },
    end: { row: Math.max(...points.map((point) => point.row)), column: Math.max(...points.map((point) => point.column)) },
  };
  const value = range.start.row === range.end.row && range.start.column === range.end.column
    ? formatCellReference(range.start)
    : `${formatCellReference(range.start)}:${formatCellReference(range.end)}`;
  if (dimension === undefined) editor.insertMarkupBefore(sheetData, `<${qualified(document.root.prefix, "dimension")} ref="${value}"/>`);
  else {
    const reference = attribute(dimension, "ref");
    if (reference === undefined) editor.insertAttribute(dimension, "ref", value);
    else editor.setAttribute(reference, value);
  }
}

function uniqueNewFonts(fonts: readonly SpreadsheetFont[], initial: number): readonly { readonly value: SpreadsheetFont }[] {
  const result: { value: SpreadsheetFont }[] = [];
  for (const font of fonts.slice(initial)) {
    if (fonts.slice(0, initial).some((candidate) => equal(candidate, font)) || result.some((candidate) => equal(candidate.value, font))) continue;
    result.push({ value: font });
  }
  return result;
}

function appendCollection(
  editor: ReturnType<typeof beginLosslessXmlEdit>,
  document: LosslessXmlDocument,
  collection: LosslessXmlElement,
  markup: string,
  count: number,
): void {
  if (markup !== "") {
    if (collection.selfClosing) {
      const start = setRawAttribute(
        document.source.slice(collection.startTagSpan.start, collection.startTagSpan.end),
        "count",
        String(count),
      ).replace(/\/\s*>$/, ">");
      editor.replaceElementMarkup(collection, `${start}${markup}</${collection.qualified}>`);
      return;
    }
    editor.appendMarkup(collection, markup);
  }
  const countAttribute = attribute(collection, "count");
  if (countAttribute === undefined) editor.insertAttribute(collection, "count", String(count));
  else editor.setAttribute(countAttribute, String(count));
}

function setRawAttribute(startTag: string, name: string, value: string): string {
  const expression = new RegExp(`(\\s${name}\\s*=\\s*["'])[^"']*(["'])`);
  if (expression.test(startTag)) return startTag.replace(expression, `$1${value}$2`);
  const offset = startTag.search(/\/?>\s*$/);
  return `${startTag.slice(0, offset)} ${name}="${value}"${startTag.slice(offset)}`;
}

function serializeStyleSheet(
  workbook: SpreadsheetWorkbook,
  fonts: readonly SpreadsheetFont[],
  formats: readonly SpreadsheetCellFormat[],
): string {
  const namespace = spreadsheetNamespace(workbook.conformance);
  const prefix = "";
  return `<styleSheet xmlns="${namespace}"><fonts count="${fonts.length}">${fonts.map((font) => serializeFont(prefix, font)).join("")}</fonts>` +
    `<fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders>` +
    `<cellXfs count="${formats.length}">${formats.map((format) => serializeCellFormat(prefix, format, indexOf(fonts, format.font), 0, 0)).join("")}</cellXfs></styleSheet>`;
}

function serializeFont(prefix: string, font: SpreadsheetFont): string {
  const item = (name: string, value?: string) => value === undefined
    ? `<${qualified(prefix, name)}/>`
    : `<${qualified(prefix, name)} val="${escapeAttribute(value)}"/>`;
  return `<${qualified(prefix, "font")}>` +
    (font.name === undefined ? "" : item("name", font.name)) +
    (font.size === undefined ? "" : item("sz", String(font.size))) +
    (font.bold ? item("b") : "") +
    (font.italic ? item("i") : "") +
    (font.underline === undefined ? "" : item("u", font.underline)) +
    (font.strike ? item("strike") : "") +
    (font.color === undefined ? "" : serializeColor(prefix, "color", font.color)) +
    (font.scheme === undefined ? "" : item("scheme", font.scheme)) +
    `</${qualified(prefix, "font")}>`;
}

function serializeColor(prefix: string, name: string, color: SpreadsheetColor): string {
  const tint = color.tint === 0 ? "" : ` tint="${color.tint}"`;
  const property = color.type === "automatic" ? ' auto="1"' : color.type === "rgb"
    ? ` rgb="${color.argb}"` : color.type === "indexed" ? ` indexed="${color.index}"` : ` theme="${color.index}"`;
  return `<${qualified(prefix, name)}${property}${tint}/>`;
}

function serializeCellFormat(
  prefix: string,
  format: SpreadsheetCellFormat,
  fontId: number,
  fillId: number,
  borderId: number,
): string {
  const alignment = serializeAlignment(prefix, format.alignment);
  return `<${qualified(prefix, "xf")} numFmtId="${format.numberFormatId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" applyFont="1" applyAlignment="1"${alignment === "" ? "/>" : `>${alignment}</${qualified(prefix, "xf")}>`}`;
}

function serializeAlignment(prefix: string, alignment: SpreadsheetAlignment): string {
  const attributes = [
    alignment.horizontal === undefined ? "" : ` horizontal="${escapeAttribute(alignment.horizontal)}"`,
    alignment.vertical === undefined ? "" : ` vertical="${escapeAttribute(alignment.vertical)}"`,
    alignment.wrapText ? ' wrapText="1"' : "",
    alignment.shrinkToFit ? ' shrinkToFit="1"' : "",
    alignment.textRotation === 0 ? "" : ` textRotation="${alignment.textRotation}"`,
    alignment.indent === 0 ? "" : ` indent="${alignment.indent}"`,
    alignment.readingOrder === 0 ? "" : ` readingOrder="${alignment.readingOrder}"`,
  ].join("");
  return attributes === "" ? "" : `<${qualified(prefix, "alignment")}${attributes}/>`;
}

function availableStylesPartName(workbook: SpreadsheetWorkbook): PartName {
  const directory = workbook.part.name.value.slice(0, workbook.part.name.value.lastIndexOf("/") + 1);
  for (let suffix = 0; ; suffix += 1) {
    const name = PartName.parse(`${directory}styles${suffix === 0 ? "" : suffix}.xml`);
    if (workbook.package.getPart(name) === undefined) return name;
  }
}

function availableRelationshipId(workbook: SpreadsheetWorkbook): string {
  const used = new Set(workbook.package.relationships(workbook.part.name).items.map((relationship) => relationship.id));
  for (let suffix = 0; ; suffix += 1) {
    const id = `tumblerStyles${suffix === 0 ? "" : suffix}`;
    if (!used.has(id)) return id;
  }
}

function stylesRelationshipType(workbook: SpreadsheetWorkbook): string {
  return workbook.conformance === "strict"
    ? "http://purl.oclc.org/ooxml/officeDocument/relationships/styles"
    : "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
}

function spreadsheetNamespace(conformance: "strict" | "transitional"): string {
  return conformance === "strict"
    ? "http://purl.oclc.org/ooxml/spreadsheetml/main"
    : "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
}

function indexOf<T>(values: readonly T[], target: T): number {
  const index = values.findIndex((value) => equal(value, target));
  if (index < 0) throw new SpreadsheetError("invalid_styles", "A resolved style component is missing from its collection.");
  return index;
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function child(parent: LosslessXmlElement, namespace: string, name: string): LosslessXmlElement | undefined {
  return parent.children.find((node): node is LosslessXmlElement =>
    node.kind === "element" && node.namespaceUri === namespace && node.localName === name
  );
}

function children(parent: LosslessXmlElement, namespace: string, name: string): LosslessXmlElement[] {
  return parent.children.filter((node): node is LosslessXmlElement =>
    node.kind === "element" && node.namespaceUri === namespace && node.localName === name
  );
}

function attribute(element: LosslessXmlElement, name: string): LosslessXmlAttribute | undefined {
  return element.attributes.find((candidate) => candidate.namespaceUri === "" && candidate.localName === name);
}

function qualified(prefix: string, local: string): string {
  return prefix === "" ? local : `${prefix}:${local}`;
}

function sourceForNode(document: LosslessXmlDocument, node: LosslessXmlNode): string {
  return document.source.slice(node.span.start, node.span.end);
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
