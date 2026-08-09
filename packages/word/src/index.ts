/** WordprocessingML reading, layout, and editing model. */
export {
  openWordDocument,
  WordDocument,
  WordError,
} from "./document.ts";
export type {
  OpenWordDocumentOptions,
  WordBlock,
  WordBreak,
  WordBreakType,
  WordConformance,
  WordErrorCode,
  WordFieldCharacter,
  WordHyperlink,
  WordHeaderFooterReference,
  WordHeaderFooterStory,
  WordInline,
  WordParagraph,
  WordRun,
  WordRunContent,
  WordSectionProperties,
  WordTable,
  WordTableCellMargins,
  WordTableProperties,
  WordTableWidth,
  WordTableCell,
  WordTableRow,
  WordText,
} from "./document.ts";
export {
  readWordStyles,
  WordStyles,
} from "./styles.ts";
export {
  layoutWordDocument,
  wordPointsToCssPixels,
} from "./layout.ts";
export {
  openWordArtifact,
  WordArtifact,
} from "./artifact.ts";
export type { OpenWordArtifactOptions } from "./artifact.ts";
export {
  wordParagraphText,
  wordParagraphTextSegments,
} from "./text.ts";
export type {
  WordParagraphTextSegment,
  WordTextPosition,
  WordTextSelection,
} from "./text.ts";
export { replaceWordText } from "./editor.ts";
export {
  formatWordSelection,
  wordFormattingState,
  WORD_FORMATTING_CAPABILITIES,
} from "./formatting.ts";
export type { WordFormattingDocumentAdapter, WordFormattingTarget } from "./formatting.ts";
export { readWordNumbering, WordNumbering } from "./numbering.ts";
export type {
  WordAbstractNumbering,
  WordListMarker,
  WordNumberFormat,
  WordNumberingInstance,
  WordNumberingLevel,
  WordParagraphNumbering,
} from "./numbering.ts";
export { resolveWordTableGrid } from "./table-grid.ts";
export type { ResolvedWordTable, ResolvedWordTableCell, ResolvedWordTableRow } from "./table-grid.ts";
export { readWordDrawings } from "./drawings.ts";
export type { WordChartDrawing, WordDrawing, WordDrawingAnchor, WordImageDrawing, WordUnsupportedDrawing } from "./drawings.ts";
export { openWordEditingSession, WordEditingSession } from "./session.ts";
export type {
  WordEditingSessionOptions,
  WordSessionChange,
  WordSessionChangeReason,
  WordSessionListener,
} from "./session.ts";
export type {
  WordLayout,
  WordLayoutColumn,
  WordLayoutFragment,
  WordLayoutLine,
  WordLayoutMarker,
  WordLayoutOptions,
  WordLayoutPage,
  WordLayoutTable,
  WordLayoutTableCell,
  WordTextMeasurement,
  WordTextMeasurer,
} from "./layout.ts";
export type {
  ComputedWordParagraphFormat,
  ComputedWordTextFormat,
  WordColor,
  WordParagraphProperties,
  WordRunProperties,
  WordStyle,
  WordTabStop,
} from "./styles.ts";
