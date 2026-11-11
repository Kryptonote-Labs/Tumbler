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
export { parseSpreadsheetHyperlinkLocation, spreadsheetHyperlinkAt } from "./hyperlinks.ts";
export type {
  SpreadsheetExternalHyperlink,
  SpreadsheetHyperlink,
  SpreadsheetHyperlinkDestination,
  SpreadsheetInternalHyperlink,
} from "./hyperlinks.ts";
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
export { emuToCssPixels, spreadsheetDrawingBounds } from "./drawings.ts";
export { parseSpreadsheetChartReference, resolveSpreadsheetChartData, resolveSpreadsheetChartDataSet } from "./chart-data.ts";
export { resolveSpreadsheetChartColor } from "./chart-colors.ts";
export type { SpreadsheetChartReference } from "./chart-data.ts";
export type {
  SpreadsheetChartFrame,
  SpreadsheetDrawing,
  SpreadsheetDrawingAnchor,
  SpreadsheetDrawingBounds,
  SpreadsheetDrawingMarker,
} from "./drawings.ts";
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
  projectSpreadsheetAutoFilter,
  projectSpreadsheetTable,
  savedSpreadsheetAutoFilterView,
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
  MAX_FORMULA_LENGTH,
  SpreadsheetEditor,
} from "./editor.ts";
export {
  applySpreadsheetDifferentialFormats,
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
export type { SpreadsheetCalculationOptions } from "./calculation.ts";
export {
  parseSpreadsheetConditionalFormatting,
  projectSpreadsheetConditionalStyles,
  SpreadsheetConditionalStyleProjection,
} from "./conditional-formatting.ts";
export type {
  SpreadsheetConditionalFormatting,
  SpreadsheetConditionalFormattingDiagnostic,
  SpreadsheetConditionalFormattingDiagnosticCode,
  SpreadsheetConditionalFormattingOperator,
  SpreadsheetConditionalFormattingRule,
} from "./conditional-formatting.ts";
export type {
  SpreadsheetAlignment,
  SpreadsheetBorder,
  SpreadsheetBorderEdge,
  SpreadsheetCellFormat,
  SpreadsheetColor,
  SpreadsheetDifferentialBorder,
  SpreadsheetDifferentialFormat,
  SpreadsheetFill,
  SpreadsheetFont,
  SpreadsheetProtection,
} from "./styles.ts";
export type {
  EditableCellValue,
  SpreadsheetEditorStatus,
} from "./editor.ts";
export {
  clearSpreadsheetFormattingPackage,
  formatSpreadsheetCells,
  formatSpreadsheetCellsPackage,
  MAX_FORMATTED_CELLS,
  spreadsheetFormattingState,
  SPREADSHEET_FORMATTING_CAPABILITIES,
} from "./formatting.ts";
export type { SpreadsheetFormattingTarget } from "./formatting.ts";
export {
  adjustSpreadsheetNumberDecimalsPackage,
  adjustSpreadsheetNumberFormatDecimals,
  describeSpreadsheetNumberFormat,
  formatSpreadsheetNumbersPackage,
  spreadsheetNumberFormatState,
  SPREADSHEET_NUMBER_FORMAT_PRESETS,
} from "./number-format-authoring.ts";
export type {
  SpreadsheetDecimalDirection,
  SpreadsheetNumberFormat,
  SpreadsheetNumberFormatCategory,
  SpreadsheetNumberFormatInput,
  SpreadsheetNumberFormatPreset,
} from "./number-format-authoring.ts";
export { setSpreadsheetBordersPackage, SPREADSHEET_BORDER_PRESETS, SPREADSHEET_BORDER_STYLES } from "./borders.ts";
export type { SpreadsheetBorderOptions, SpreadsheetBorderPreset, SpreadsheetBorderStyle } from "./borders.ts";
export { spreadsheetFormattingCommand, spreadsheetFormattingPatch } from "./formatting-commands.ts";
export type { SpreadsheetFormattingCommand } from "./formatting-commands.ts";
export type {
  SpreadsheetCell,
  SpreadsheetCellValue,
  SpreadsheetColumn,
  SpreadsheetPane,
  SpreadsheetRow,
} from "./worksheet.ts";

export { createSpreadsheet, applySpreadsheetCommand, inspectSpreadsheet, spreadsheetCommand } from "./commands.ts";
export type { SpreadsheetCommand } from "./commands.ts";
export { createSpreadsheetNativeArchive, openSpreadsheetNativeArchive, encodeSpreadsheetNativeArchive, decodeSpreadsheetNativeArchive, isSpreadsheetNativeArchive } from "./native.ts";
export type { NativeSpreadsheetArchive } from "./native.ts";

export { applySpreadsheetStructureCommand, rebaseSpreadsheetFormula } from "./structure.ts";
export type { SpreadsheetStructureCommand } from "./structure.ts";

export { translateSpreadsheetFormula } from './formula-translation.ts';

export { readSpreadsheetDrawingObjects } from './drawing-objects.ts';
export type { SpreadsheetDrawingObject, SpreadsheetDrawingObjectFrame } from './drawing-objects.ts';

export { spreadsheetDrawingCommand, applySpreadsheetDrawingCommand } from './drawing-commands.ts';
export type { SpreadsheetDrawingCommand } from './drawing-commands.ts';
export { spreadsheetDrawingObjectId } from './drawings.ts';
export { spreadsheetPrintHeaderText, spreadsheetPrintPages, type SpreadsheetPrintPage } from './print.ts';
export { spreadsheetFormatPainterSample } from './format-painter.ts';
export { createChartWorkbook, extendChartWorkbook, refreshChartWorkbook } from './chart-workbook.ts';
export type { ChartWorkbookEdit } from './chart-workbook.ts';
export { spreadsheetChartContent } from './chart-content.ts';
