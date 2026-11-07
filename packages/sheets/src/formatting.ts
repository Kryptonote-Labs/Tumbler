import {
  normalizeFormattingPatch,
  OFFICE_THEME_COLOR_SLOTS,
  type CellFill,
  type CellTextRotation,
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
import type { OpcPackage } from "@tumblerjs/opc";
import { EXCEL_MAX_ROWS, EXCEL_MAX_COLUMNS, formatCellReference, parseCellRange, type CellAddress, type CellRange } from "./references.ts";
import { restyleSpreadsheetRange } from "./sheet-restyle.ts";
import type { SpreadsheetStyleTransform } from "./style-planner.ts";
import type {
  SpreadsheetAlignment,
  SpreadsheetCellFormat,
  SpreadsheetColor,
  SpreadsheetFill,
  SpreadsheetFont,
  SpreadsheetStyles,
} from "./styles.ts";
import type { SpreadsheetWorksheet } from "./worksheet.ts";
import type { SpreadsheetSheet, SpreadsheetWorkbook } from "./workbook.ts";

/** The worksheet grid is the formatting limit, matching Excel. */
export const MAX_FORMATTED_CELLS = EXCEL_MAX_ROWS * EXCEL_MAX_COLUMNS;

export const SPREADSHEET_FORMATTING_CAPABILITIES: FormattingCapabilities = Object.freeze({
  text: Object.freeze({
    fontSize: Object.freeze({ minimum: 1, maximum: 409 }),
    fontFamily: true,
    bold: true,
    italic: true,
    underline: Object.freeze(["none", "single", "double"] as const),
    strike: true,
    color: true,
    themeColor: true,
  }),
  block: Object.freeze({
    horizontalAlignment: Object.freeze(["start", "center", "end", "justify"] as const),
    verticalAlignment: Object.freeze(["top", "center", "bottom"] as const),
  }),
  cell: Object.freeze({
    fill: true,
    wrapText: true,
    textRotation: Object.freeze({ minimum: -90, maximum: 90, vertical: true }),
    indent: Object.freeze({ minimum: 0, maximum: 250 }),
  }),
});

export type SpreadsheetFormattingTarget = string | CellRange;

/** Reads effective formatting across a range without exposing SpreadsheetML style indexes. */
export function spreadsheetFormattingState(
  worksheet: SpreadsheetWorksheet,
  target: SpreadsheetFormattingTarget,
): FormattingState {
  const formats = spreadsheetLogicalFormats(worksheet, target);
  const styles = worksheet.styles;
  const fonts = formats.map((format) => format.font);
  const alignments = formats.map((format) => format.alignment);
  return Object.freeze({
    text: Object.freeze({
      fontSize: combine(fonts.map((font) => font.size)),
      fontFamily: combine(fonts.map((font) => styles.resolveFontName(font))),
      bold: combine(fonts.map((font) => font.bold)),
      italic: combine(fonts.map((font) => font.italic)),
      underline: combine(fonts.map((font) => spreadsheetUnderline(font.underline))),
      strike: combine(fonts.map((font) => font.strike)),
      color: combine(fonts.map((font) => officeColor(styles, font.color))),
    }),
    block: Object.freeze({
      horizontalAlignment: combine(alignments.map((alignment) => officeHorizontalAlignment(alignment.horizontal))),
      verticalAlignment: combine(alignments.map((alignment) => officeVerticalAlignment(alignment.vertical))),
    }),
    cell: Object.freeze({
      fill: combine(formats.map((format) => cellFill(styles, format.fill))),
      wrapText: combine(alignments.map((alignment) => alignment.wrapText)),
      textRotation: combine(alignments.map((alignment) => cellTextRotation(alignment.textRotation))),
      indent: combine(alignments.map((alignment) => alignment.indent)),
    }),
  });
}

/** Effective formats of the logical cells in a range, sampling sparse whole-axis ranges. */
export function spreadsheetLogicalFormats(worksheet: SpreadsheetWorksheet, target: SpreadsheetFormattingTarget): SpreadsheetCellFormat[] {
  const range = normalizeSpreadsheetRange(target);
  return logicalCells(worksheet, range).map((address) => worksheet.cellStyle(address));
}

/** Applies semantic formatting entirely in-memory and returns a new XLSX byte sequence. */
export function formatSpreadsheetCells(
  workbook: SpreadsheetWorkbook,
  sheet: SpreadsheetSheet,
  target: SpreadsheetFormattingTarget,
  input: FormattingPatch,
): Uint8Array {
  return formatSpreadsheetCellsPackage(workbook, sheet, target, input).archive.originalBytes();
}

/** Apply styles to native package members without rebuilding an XLSX. */
export function formatSpreadsheetCellsPackage(
  workbook: SpreadsheetWorkbook,
  sheet: SpreadsheetSheet,
  target: SpreadsheetFormattingTarget,
  input: FormattingPatch,
): OpcPackage {
  const patch = normalizeFormattingPatch(input);
  const size = patch.text?.fontSize;
  if (size && "set" in size && (size.set < 1 || size.set > 409)) throw new RangeError("Spreadsheet font sizes must be between 1 and 409 points.");
  if (patch.text === undefined && patch.block === undefined && patch.cell === undefined) return workbook.package;
  return restyleSpreadsheetTarget(workbook, sheet, target, (format, normal) => applyFormattingPatch(format, normal, patch));
}

/** Resets fonts, fills, borders, alignment and number formats to the Normal style; values stay. */
export function clearSpreadsheetFormattingPackage(
  workbook: SpreadsheetWorkbook,
  sheet: SpreadsheetSheet,
  target: SpreadsheetFormattingTarget,
): OpcPackage {
  return restyleSpreadsheetTarget(workbook, sheet, target, clearFormatting);
}

const clearFormatting: SpreadsheetStyleTransform = (_format, normal) => normal;

/** Validates a target and applies one transform to it. */
export function restyleSpreadsheetTarget(
  workbook: SpreadsheetWorkbook,
  sheet: SpreadsheetSheet,
  target: SpreadsheetFormattingTarget,
  transform: SpreadsheetStyleTransform,
): OpcPackage {
  if (!workbook.sheets.includes(sheet)) throw new TypeError("The sheet does not belong to this workbook.");
  return restyleSpreadsheetRange(workbook, sheet, normalizeSpreadsheetRange(target), transform);
}

function applyFormattingPatch(base: SpreadsheetCellFormat, normal: SpreadsheetCellFormat, patch: FormattingPatch): SpreadsheetCellFormat {
  const fill = patch.cell?.fill;
  return Object.freeze({
    ...base,
    font: applyFontPatch(base.font, normal.font, patch),
    fill: fill === undefined ? base.fill : "inherit" in fill ? normal.fill : spreadsheetFill(fill.set),
    alignment: applyAlignmentPatch(base.alignment, normal.alignment, patch),
  });
}

function applyFontPatch(base: SpreadsheetFont, fallback: SpreadsheetFont, patch: FormattingPatch): SpreadsheetFont {
  const text = patch.text;
  if (text === undefined) return base;
  const font = {
    ...base,
    size: changed(base.size, fallback.size, text.fontSize, identity),
    bold: changed(base.bold, fallback.bold, text.bold, identity),
    italic: changed(base.italic, fallback.italic, text.italic, identity),
    underline: changed(base.underline, fallback.underline, text.underline, (value) => value === "none" ? undefined : value),
    strike: changed(base.strike, fallback.strike, text.strike, identity),
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
  const { block, cell } = patch;
  if (block === undefined && cell === undefined) return base;
  const alignment = {
    ...base,
    horizontal: changed(base.horizontal, fallback.horizontal, block?.horizontalAlignment, spreadsheetHorizontalAlignment),
    vertical: changed(base.vertical, fallback.vertical, block?.verticalAlignment, identity),
    wrapText: changed(base.wrapText, fallback.wrapText, cell?.wrapText, identity),
    textRotation: changed(base.textRotation, fallback.textRotation, cell?.textRotation, spreadsheetTextRotation),
    indent: changed(base.indent, fallback.indent, cell?.indent, identity),
  };
  // Excel indents only left, right and distributed text; it switches other alignments to left.
  if (alignment.indent > 0 && alignment.horizontal !== "left" && alignment.horizontal !== "right" && alignment.horizontal !== "distributed") {
    alignment.horizontal = "left";
  }
  return Object.freeze(alignment);
}

function changed<TSource, TTarget>(
  current: TTarget,
  fallback: TTarget,
  change: FormattingChange<TSource> | undefined,
  convert: (value: TSource) => TTarget,
): TTarget {
  if (change === undefined) return current;
  return "inherit" in change ? fallback : convert(change.set);
}

function identity<T>(value: T): T {
  return value;
}

/** Converts a shared colour to SpreadsheetML, keeping theme slot and tint. */
export function spreadsheetColor(color: OfficeColor): SpreadsheetColor {
  if (color.type === "automatic") return Object.freeze({ type: "automatic", tint: 0 });
  if (color.type === "rgb") return Object.freeze({ type: "rgb", argb: `FF${color.value.slice(1).toUpperCase()}`, tint: 0 });
  return Object.freeze({ type: "theme", index: OFFICE_THEME_COLOR_SLOTS.indexOf(color.slot), tint: color.tint ?? 0 });
}

/** Reports source colour identity; indexed colours resolve to RGB. */
export function officeColor(styles: SpreadsheetStyles, value: SpreadsheetColor | undefined): OfficeColor {
  const argb = styles.resolveColor(value);
  const rgb = argb === undefined ? undefined : `#${argb.slice(2)}`;
  const slot = value?.type === "theme" ? OFFICE_THEME_COLOR_SLOTS[value.index] : undefined;
  if (value !== undefined && slot !== undefined) {
    return Object.freeze({
      type: "theme",
      slot,
      ...(value.tint === 0 ? {} : { tint: value.tint }),
      ...(rgb === undefined ? {} : { value: rgb }),
    });
  }
  return rgb === undefined ? Object.freeze({ type: "automatic" }) : Object.freeze({ type: "rgb", value: rgb });
}

function spreadsheetFill(fill: CellFill): SpreadsheetFill {
  return fill.type === "none"
    ? Object.freeze({ patternType: "none", foreground: undefined, background: undefined })
    : Object.freeze({
      patternType: "solid",
      foreground: spreadsheetColor(fill.color),
      // Excel writes system background colour 64 behind solid fills.
      background: Object.freeze({ type: "indexed", index: 64, tint: 0 }),
    });
}

function cellFill(styles: SpreadsheetStyles, fill: SpreadsheetFill): CellFill | undefined {
  if (fill.patternType === undefined || fill.patternType === "none") return Object.freeze({ type: "none" });
  if (fill.patternType !== "solid") return undefined;
  return Object.freeze({ type: "solid", color: officeColor(styles, fill.foreground) });
}

/** SpreadsheetML stores clockwise angles as 91–180 and stacked text as 255. */
function spreadsheetTextRotation(value: CellTextRotation): number {
  return value === "vertical" ? 255 : value >= 0 ? value : 90 - value;
}

function cellTextRotation(value: number): CellTextRotation {
  return value === 255 ? "vertical" : value <= 90 ? value : 90 - value;
}

function spreadsheetHorizontalAlignment(value: HorizontalAlignment): string {
  return value === "start" ? "left" : value === "end" ? "right" : value;
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

/** Uniform values report `value`, differing values `mixed`, and unrepresentable values `unavailable`. */
export function combine<T>(values: readonly (T | undefined)[]): FormattingValue<T> {
  if (values.length === 0) return Object.freeze({ state: "unavailable" });
  const first = values[0];
  const key = JSON.stringify(first);
  if (values.some((value) => JSON.stringify(value) !== key)) return Object.freeze({ state: "mixed" });
  if (first === undefined) return Object.freeze({ state: "unavailable" });
  return Object.freeze({ state: "value", value: first });
}

/** Parses and orders a target range, rejecting ranges beyond the worksheet grid. */
export function normalizeSpreadsheetRange(target: SpreadsheetFormattingTarget): CellRange {
  const range = typeof target === "string" ? parseCellRange(target) : parseCellRange(`${formatCellReference(target.start)}:${formatCellReference(target.end)}`);
  const normalized = Object.freeze({
    start: Object.freeze({ row: Math.min(range.start.row, range.end.row), column: Math.min(range.start.column, range.end.column) }),
    end: Object.freeze({ row: Math.max(range.start.row, range.end.row), column: Math.max(range.start.column, range.end.column) }),
  });
  const count = (normalized.end.row - normalized.start.row + 1) * (normalized.end.column - normalized.start.column + 1);
  if (!Number.isSafeInteger(count) || count > MAX_FORMATTED_CELLS) {
    throw new RangeError(`A formatting operation cannot exceed ${MAX_FORMATTED_CELLS.toLocaleString("en-US")} cells.`);
  }
  return normalized;
}

function cells(range: CellRange): CellAddress[] {
  const result: CellAddress[] = [];
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let column = range.start.column; column <= range.end.column; column += 1) result.push({ row, column });
  }
  return result;
}

/** Merged continuations are presentation coordinates; their top-left owner is the logical cell. */
function logicalCells(worksheet: SpreadsheetWorksheet, range: CellRange): CellAddress[] {
  const result = new Map<string, CellAddress>();
  const area = (range.end.row-range.start.row+1)*(range.end.column-range.start.column+1);
  let addresses: CellAddress[];
  if (area > 100_000) {
    // Sparse ranges vary only at stored rows, column-definition boundaries and stored cells.
    const rows = new Set([range.start.row, range.end.row]);
    const columns = new Set([range.start.column,range.end.column]);
    for (const row of worksheet.rows) if (row.index >= range.start.row && row.index <= range.end.row) {
      rows.add(row.index);
      if (row.index < range.end.row) rows.add(row.index+1);
    }
    for (const col of worksheet.columns) for (const n of [col.min,col.max,col.max+1]) if (n >= range.start.column && n <= range.end.column) columns.add(n);
    addresses = [...rows].flatMap(row => [...columns].map(column => ({row,column})));
    for (const row of worksheet.rows) for (const cell of row.cells) if (cell.address.row >= range.start.row && cell.address.row <= range.end.row && cell.address.column >= range.start.column && cell.address.column <= range.end.column) addresses.push(cell.address);
  } else addresses = cells(range);
  for (const address of addresses) {
    const owner = worksheet.mergedRange(address)?.start ?? address;
    result.set(formatCellReference(owner), owner);
  }
  return [...result.values()];
}
