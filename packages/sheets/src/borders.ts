import { normalizeOfficeColor, type OfficeColor } from "@tumblerjs/core";
import type { OpcPackage } from "@tumblerjs/opc";
import { normalizeSpreadsheetRange, spreadsheetColor, type SpreadsheetFormattingTarget } from "./formatting.ts";
import type { CellAddress, CellRange } from "./references.ts";
import { restyleSpreadsheetCells, restyleSpreadsheetRange } from "./sheet-restyle.ts";
import type { SpreadsheetStyleTransform } from "./style-planner.ts";
import type { SpreadsheetBorder, SpreadsheetBorderEdge, SpreadsheetCellFormat } from "./styles.ts";
import { openWorksheet, type SpreadsheetWorksheet } from "./worksheet.ts";
import { openSpreadsheet, type SpreadsheetSheet, type SpreadsheetWorkbook } from "./workbook.ts";

/** SpreadsheetML ST_BorderStyle values other than none (ECMA-376-1 §18.18.3). */
export const SPREADSHEET_BORDER_STYLES = Object.freeze([
  "thin", "medium", "thick", "double", "hair", "dotted", "dashed", "dashDot", "dashDotDot",
  "mediumDashed", "mediumDashDot", "mediumDashDotDot", "slantDashDot",
] as const);
export type SpreadsheetBorderStyle = typeof SPREADSHEET_BORDER_STYLES[number];

export const SPREADSHEET_BORDER_PRESETS = Object.freeze([
  "none", "all", "outside", "inside", "top", "bottom", "left", "right", "horizontal", "vertical",
] as const);
export type SpreadsheetBorderPreset = typeof SPREADSHEET_BORDER_PRESETS[number];

export interface SpreadsheetBorderOptions {
  readonly preset: SpreadsheetBorderPreset;
  /** Line style for every preset except `none`; defaults to thin. */
  readonly style?: SpreadsheetBorderStyle;
  /** Line colour; defaults to automatic. */
  readonly color?: OfficeColor;
}

type Side = "top" | "bottom" | "left" | "right";
type Band = { readonly start: number; readonly end: number; readonly first: boolean; readonly last: boolean };

/**
 * Applies a border preset to a range. Merged cells count as one logical cell,
 * edges the preset does not name are preserved, and large ranges are split
 * into at most nine rectangles that each use sparse row/column styling.
 */
export function setSpreadsheetBordersPackage(
  workbook: SpreadsheetWorkbook,
  sheet: SpreadsheetSheet,
  target: SpreadsheetFormattingTarget,
  options: SpreadsheetBorderOptions,
): OpcPackage {
  if (!workbook.sheets.includes(sheet)) throw new TypeError("The sheet does not belong to this workbook.");
  if (!SPREADSHEET_BORDER_PRESETS.includes(options.preset)) throw new TypeError("Unsupported border preset.");
  const style = options.style ?? "thin";
  if (!SPREADSHEET_BORDER_STYLES.includes(style)) throw new TypeError("Unsupported border style.");
  const edge: SpreadsheetBorderEdge = options.preset === "none"
    ? Object.freeze({ style: undefined, color: undefined })
    : Object.freeze({ style, color: spreadsheetColor(normalizeOfficeColor(options.color ?? { type: "automatic" })) });

  const original = openWorksheet(workbook, sheet);
  const range = expandToMerges(original, normalizeSpreadsheetRange(target));
  let pkg = workbook.package;
  for (const region of regions(range, options.preset)) {
    const current = pkg === workbook.package ? workbook : openSpreadsheet(pkg);
    pkg = restyleSpreadsheetRange(current, sheetIn(current, sheet), region.range, withEdges(region.sides, edge));
  }

  // Merged cells draw their outer edges from boundary cells; the top-left cell carries all four.
  // Boundary cells restart from their original style so interior sides from the region pass are undone.
  const merges = original.merges.filter((merge) => contains(range, merge));
  if (merges.length === 0) return pkg;
  const items = merges.flatMap((merge) => {
    const sides = presetSides(options.preset, rowBand(merge, range), columnBand(merge, range));
    return boundaryCells(merge).map(({ address, sides: boundary }) => ({
      address,
      baseIndex: original.effectiveStyleIndex(address) ?? 0,
      transform: withEdges(sameCell(address, merge.start) ? sides : sides.filter((side) => boundary.has(side)), edge),
    }));
  });
  const current = pkg === workbook.package ? workbook : openSpreadsheet(pkg);
  return restyleSpreadsheetCells(current, sheetIn(current, sheet), items);
}

/** Replaces the named sides and keeps the others, including any diagonal. */
function withEdges(sides: readonly Side[], edge: SpreadsheetBorderEdge): SpreadsheetStyleTransform {
  return (format: SpreadsheetCellFormat) => {
    if (sides.length === 0) return format;
    const border: { -readonly [K in keyof SpreadsheetBorder]: SpreadsheetBorder[K] } = { ...format.border };
    for (const side of sides) border[side] = edge;
    return Object.freeze({ ...format, border: Object.freeze(border) });
  };
}

function presetSides(preset: SpreadsheetBorderPreset, rows: Pick<Band, "first" | "last">, columns: Pick<Band, "first" | "last">): Side[] {
  const sides: Side[] = [];
  const add = (side: Side, condition: boolean) => { if (condition) sides.push(side); };
  const outer = { top: rows.first, bottom: rows.last, left: columns.first, right: columns.last };
  for (const side of ["top", "bottom", "left", "right"] as const) {
    const horizontal = side === "top" || side === "bottom";
    switch (preset) {
      case "none": case "all": add(side, true); break;
      case "outside": add(side, outer[side]); break;
      case "inside": add(side, !outer[side]); break;
      case "horizontal": add(side, horizontal && !outer[side]); break;
      case "vertical": add(side, !horizontal && !outer[side]); break;
      default: add(side, preset === side && outer[side]);
    }
  }
  return sides;
}

/** First, middle and last bands, coalescing neighbours that receive identical sides. */
function regions(range: CellRange, preset: SpreadsheetBorderPreset): { range: CellRange; sides: Side[] }[] {
  const rows = coalesce(bands(range.start.row, range.end.row), bands(range.start.column, range.end.column), preset, true);
  const columns = coalesce(bands(range.start.column, range.end.column), rows, preset, false);
  return rows.flatMap((row) => columns.map((column) => ({
    range: { start: { row: row.start, column: column.start }, end: { row: row.end, column: column.end } },
    sides: presetSides(preset, row, column),
  }))).filter((region) => region.sides.length > 0);
}

function bands(start: number, end: number): Band[] {
  if (start === end) return [{ start, end, first: true, last: true }];
  if (end === start + 1) return [{ start, end: start, first: true, last: false }, { start: end, end, first: false, last: true }];
  return [
    { start, end: start, first: true, last: false },
    { start: start + 1, end: end - 1, first: false, last: false },
    { start: end, end, first: false, last: true },
  ];
}

function coalesce(items: Band[], others: readonly Band[], preset: SpreadsheetBorderPreset, isRow: boolean): Band[] {
  const sides = (band: Band, other: Band) => (isRow ? presetSides(preset, band, other) : presetSides(preset, other, band)).join();
  const result: Band[] = [];
  for (const band of items) {
    const previous = result.at(-1);
    if (previous !== undefined && others.every((other) => sides(previous, other) === sides(band, other))) {
      result[result.length - 1] = { start: previous.start, end: band.end, first: previous.first, last: band.last };
    } else result.push(band);
  }
  return result;
}

/** Excel extends a border selection to whole merged cells. */
function expandToMerges(worksheet: SpreadsheetWorksheet, range: CellRange): CellRange {
  let current = range;
  for (let changed = true; changed;) {
    changed = false;
    for (const merge of worksheet.merges) {
      if (!intersects(current, merge) || contains(current, merge)) continue;
      current = {
        start: { row: Math.min(current.start.row, merge.start.row), column: Math.min(current.start.column, merge.start.column) },
        end: { row: Math.max(current.end.row, merge.end.row), column: Math.max(current.end.column, merge.end.column) },
      };
      changed = true;
    }
  }
  return current;
}

function boundaryCells(merge: CellRange): { address: CellAddress; sides: Set<Side> }[] {
  const cells = new Map<string, { address: CellAddress; sides: Set<Side> }>();
  const add = (row: number, column: number, side: Side) => {
    const key = `${row}:${column}`;
    const cell = cells.get(key) ?? { address: { row, column }, sides: new Set<Side>() };
    cell.sides.add(side);
    cells.set(key, cell);
  };
  for (let column = merge.start.column; column <= merge.end.column; column += 1) {
    add(merge.start.row, column, "top");
    add(merge.end.row, column, "bottom");
  }
  for (let row = merge.start.row; row <= merge.end.row; row += 1) {
    add(row, merge.start.column, "left");
    add(row, merge.end.column, "right");
  }
  return [...cells.values()];
}

function rowBand(merge: CellRange, range: CellRange) {
  return { first: merge.start.row === range.start.row, last: merge.end.row === range.end.row };
}

function columnBand(merge: CellRange, range: CellRange) {
  return { first: merge.start.column === range.start.column, last: merge.end.column === range.end.column };
}

function sheetIn(workbook: SpreadsheetWorkbook, sheet: SpreadsheetSheet): SpreadsheetSheet {
  return workbook.sheets.find((candidate) => candidate.sheetId === sheet.sheetId)!;
}

function sameCell(left: CellAddress, right: CellAddress): boolean {
  return left.row === right.row && left.column === right.column;
}

function intersects(left: CellRange, right: CellRange): boolean {
  return left.start.row <= right.end.row && right.start.row <= left.end.row &&
    left.start.column <= right.end.column && right.start.column <= left.end.column;
}

function contains(outer: CellRange, inner: CellRange): boolean {
  return inner.start.row >= outer.start.row && inner.end.row <= outer.end.row &&
    inner.start.column >= outer.start.column && inner.end.column <= outer.end.column;
}
