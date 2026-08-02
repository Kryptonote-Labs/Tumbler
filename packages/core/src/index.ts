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
