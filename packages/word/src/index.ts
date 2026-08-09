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
export type {
  ComputedWordParagraphFormat,
  ComputedWordTextFormat,
  WordColor,
  WordParagraphProperties,
  WordRunProperties,
  WordStyle,
  WordTabStop,
} from "./styles.ts";
