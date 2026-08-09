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
export { normalizeFormattingPatch } from "./formatting.ts";
export type {
  BlockFormattingPatch,
  BlockFormattingState,
  FormattingAdapter,
  FormattingCapabilities,
  FormattingChange,
  FormattingPatch,
  FormattingState,
  FormattingValue,
  HorizontalAlignment,
  OfficeColor,
  TextFormattingPatch,
  TextFormattingState,
  TextUnderline,
  VerticalAlignment,
} from "./formatting.ts";
