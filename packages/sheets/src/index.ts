/** Headless SpreadsheetML workbook, worksheet, and editing primitives. */
export {
  EXCEL_MAX_COLUMNS,
  EXCEL_MAX_ROWS,
  formatCellReference,
  formatCellRange,
  parseCellReference,
  parseCellRange,
} from "./references.ts";
export type { CellAddress, CellRange } from "./references.ts";
export {
  openSpreadsheet,
  SpreadsheetError,
  SpreadsheetWorkbook,
} from "./workbook.ts";
export {
  readSharedStrings,
  SharedStringTable,
} from "./shared-strings.ts";
export type {
  SpreadsheetErrorCode,
  SpreadsheetSheet,
  SpreadsheetSheetState,
} from "./workbook.ts";
export {
  openWorksheet,
  columnWidthToPixels,
  SpreadsheetWorksheet,
} from "./worksheet.ts";
export {
  beginSpreadsheetEdit,
  SpreadsheetEditor,
} from "./editor.ts";
export {
  readSpreadsheetStyles,
  SpreadsheetStyles,
} from "./styles.ts";
export {
  BUILT_IN_NUMBER_FORMATS,
  formatSpreadsheetCellValue,
} from "./number-format.ts";
export type { SpreadsheetFormatOptions } from "./number-format.ts";
export type {
  SpreadsheetAlignment,
  SpreadsheetBorder,
  SpreadsheetBorderEdge,
  SpreadsheetCellFormat,
  SpreadsheetColor,
  SpreadsheetFill,
  SpreadsheetFont,
} from "./styles.ts";
export type {
  EditableCellValue,
  SpreadsheetEditorStatus,
} from "./editor.ts";
export type {
  SpreadsheetCell,
  SpreadsheetCellValue,
  SpreadsheetColumn,
  SpreadsheetPane,
  SpreadsheetRow,
} from "./worksheet.ts";
