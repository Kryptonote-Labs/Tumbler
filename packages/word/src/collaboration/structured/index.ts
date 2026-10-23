export {
  WordTableConflict,
  inspectWordTableState,
  type TableAddress,
  type CellAddress,
  migrateTable,
} from "./state.ts";
export {
  structuredGrid,
  type StructuredCell,
  type StructuredRow,
} from "./grid.ts";
export {
  prepareWordUpdate,
  commitWordUpdate,
  anchorScopedSelection,
  resolveScopedAnchor,
  validateWordSharedDocument,
  type WordStructuredChange,
  type WordScopedSelection,
  type WordScopedAnchor,
  type PreparedWordUpdate,
} from "./transactions.ts";
export {
  projectWordSharedDocument,
  WordStructuredProjection,
} from "./projection.ts";
export { WordStructuredUndo } from "./undo.ts";
export { WordSharedText, wordSharedText, getWordSharedText, wordSharedOwner } from './view.ts';
