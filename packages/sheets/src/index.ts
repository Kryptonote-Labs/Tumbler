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
  SpreadsheetCalculationMode,
  SpreadsheetCalculationProperties,
  SpreadsheetSheet,
  SpreadsheetSheetState,
} from "./workbook.ts";
export {
  openWorksheet,
  columnWidthToPixels,
  rowHeightToPixels,
  SpreadsheetWorksheet,
} from "./worksheet.ts";
export type {
  SpreadsheetAutoFilter,
  SpreadsheetCustomFilter,
  SpreadsheetCustomFilterOperator,
  SpreadsheetFilterColumn,
  SpreadsheetFilterCriteria,
  SpreadsheetSortCondition,
  SpreadsheetSortState,
  SpreadsheetTable,
  SpreadsheetTableColumn,
  SpreadsheetTableStyle,
} from "./tables.ts";
export {
  clearSpreadsheetTableFilter,
  projectSpreadsheetTable,
  savedSpreadsheetTableView,
  setSpreadsheetTableSort,
  setSpreadsheetTableValueFilter,
  spreadsheetTableDistinctValues,
} from "./table-view.ts";
export type {
  SpreadsheetTableViewCriteria,
  SpreadsheetTableViewFilter,
  SpreadsheetTableViewProjection,
  SpreadsheetTableViewSort,
  SpreadsheetTableViewState,
  SpreadsheetTableViewWarning,
  SpreadsheetTableValueProvider,
} from "./table-view.ts";
export {
  beginSpreadsheetEdit,
  SpreadsheetEditor,
} from "./editor.ts";
export {
  readSpreadsheetStyles,
  SpreadsheetStyles,
} from "./styles.ts";
export { readSpreadsheetSheetProperties } from "./sheet-properties.ts";
export type { SpreadsheetSheetProperties } from "./sheet-properties.ts";
export {
  BUILT_IN_NUMBER_FORMATS,
  formatSpreadsheetCellValue,
} from "./number-format.ts";
export type { SpreadsheetFormatOptions } from "./number-format.ts";
export {
  openSpreadsheetArtifact,
  SpreadsheetArtifact,
} from "./artifact.ts";
export type { OpenSpreadsheetArtifactOptions } from "./artifact.ts";
export { calculateSpreadsheetWorksheet, SpreadsheetCalculationSnapshot } from "./calculation.ts";
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
