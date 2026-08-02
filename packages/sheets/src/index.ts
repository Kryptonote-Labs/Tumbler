/** SpreadsheetML editing model. */
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
