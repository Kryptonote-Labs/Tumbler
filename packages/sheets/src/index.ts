/** SpreadsheetML editing model. */
/** Headless SpreadsheetML workbook, worksheet, and editing primitives. */
export {
  EXCEL_MAX_COLUMNS,
  EXCEL_MAX_ROWS,
  formatCellReference,
  parseCellReference,
} from "./references.ts";
export type { CellAddress } from "./references.ts";
export {
  openSpreadsheet,
  SpreadsheetError,
  SpreadsheetWorkbook,
} from "./workbook.ts";
export type {
  SpreadsheetErrorCode,
  SpreadsheetSheet,
  SpreadsheetSheetState,
} from "./workbook.ts";
