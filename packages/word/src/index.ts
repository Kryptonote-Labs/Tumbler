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
  WordInline,
  WordParagraph,
  WordRun,
  WordRunContent,
  WordSectionProperties,
  WordTable,
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
export type {
  WordLayout,
  WordLayoutColumn,
  WordLayoutFragment,
  WordLayoutLine,
  WordLayoutOptions,
  WordLayoutPage,
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
