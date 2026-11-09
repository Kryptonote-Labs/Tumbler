/** Format-neutral editing commands, state, selection, and history. */
/** Format-neutral document interaction primitives. */
export {
  createGridSelection,
  moveGridSelection,
  normalizeGridRange,
} from "./grid-selection.ts";
export type {
  GridBounds,
  GridDirection,
  GridPoint,
  GridRange,
  GridSelection,
} from "./grid-selection.ts";
export { SparseAxisGeometry } from "./sparse-axis.ts";
export type { AxisSizeOverride } from "./sparse-axis.ts";
export {
  commitEditingHistory,
  createEditingHistory,
  editingHistoryCanRedo,
  editingHistoryCanUndo,
  editingHistoryIsDirty,
  editingHistoryValue,
  markEditingHistorySaved,
  redoEditingHistory,
  undoEditingHistory,
} from "./editing-history.ts";
export type { EditingHistory, EditingHistoryOptions } from "./editing-history.ts";
export { normalizeFormattingPatch, normalizeOfficeColor, officeColorsEqual, OFFICE_THEME_COLOR_SLOTS } from "./formatting.ts";
export type {
  BlockFormattingPatch,
  BlockFormattingState,
  CellFill,
  CellFormattingPatch,
  CellFormattingState,
  CellTextRotation,
  FormattingAdapter,
  FormattingCapabilities,
  FormattingChange,
  FormattingPatch,
  FormattingState,
  FormattingValue,
  HorizontalAlignment,
  OfficeColor,
  OfficeThemeColorSlot,
  TextFormattingPatch,
  TextFormattingState,
  TextUnderline,
  VerticalAlignment,
} from "./formatting.ts";

export { findTextMatches } from './search.ts';
export type { TextMatch, TextSearchOptions } from './search.ts';

export { textReplacement } from './text-replacement.ts';

export { FormatPainter } from './format-painter.ts';
