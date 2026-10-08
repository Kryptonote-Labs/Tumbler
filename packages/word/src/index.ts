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
  WordNoteReference,
  WordNoteStory,
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

export { positionWordDrawing, resizeWordDrawing, type WordDrawingChange, type WordDrawingResize } from "./drawings.ts";

export { createWordArtifact } from './create.ts';
export type { CreateWordOptions, WordTextFormat, WordTextRun, WordTextParagraph } from './create.ts';

export type { WordContentBlock, WordContentCell, WordAuthoredImage } from './create-content.ts';

export type { WordImagePosition } from './image-placement.ts';

export { wordLineAtPoint } from "./hit-testing.ts";
export { wordAdjacentLine, type WordLineLocation, type WordLineNavigationTarget } from "./navigation.ts";

export { NativeWordText, NativeWordTextLayout } from './native-text.ts';
export type { NativeWordParagraph, NativeWordTextEdit } from './native-text.ts';

export { NativeWordDocument } from './native-document.ts';
export { importWordContent } from './import-content.ts';
export { WordPackageDocument, reconcileWordContent, wordContentParagraphs } from './package-document.ts';

export { createWordSourceManifest, type WordSourceManifest } from './source-manifest.ts';
export type { NativeWordOptions } from './native-document.ts';

export { wordStoryArtifact, createWordStory, wordSections, type WordStoryTarget, type WordStoryKind, type WordStoryType } from './stories.ts';

export type { WordPageStory } from "./layout.ts";

export { isWordPageField, WORD_FIELD_CHARACTER, type WordPageField } from './page-fields.ts';
export { WORD_PAGE_NUMBER_PRESETS, wordPageNumberRuns, type WordPageNumberPreset } from './page-fields.ts';

export { isWordParagraphPositioning, isWordPositionalTab, type WordParagraphPositioning } from './positioning.ts';
export type { WordPositionalTab } from './document.ts';
export { wordClickAndTypeTarget, type WordClickAndTypeTarget } from './click-and-type.ts';
