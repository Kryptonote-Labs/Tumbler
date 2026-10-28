export * from './commands.ts';
export * from './formatting.ts';
export * from './images.ts';
export * from './tables.ts';
export * from './table-edits.ts';
export { validateText, validateWordText } from './validation.ts';
export { wordTextRange, isWordTextOnlyEdit, type WordTextRangePart } from './text-range.ts';
export { wordParagraphIdentity } from './paragraph-identity.ts';
export { WordParagraphProjection, type WordParagraphSlice, type WordParagraphPart } from './paragraph-projection.ts';
export { WordTableProjection } from './table-projection.ts';
export { positionedWordEdit, wordPageNumberRange, wordItemAlignment, pageNumberEdit, alignWordItem, type WordPositionedEdit, type WordItemAlignment } from './page-number.ts';
export { clickAndTypeEdit } from './click-and-type.ts';

export { formatTableDelta, type WordTableFormatPatch } from './table-format.ts';
export { findWordMatches, replaceWordMatches, type WordSearchOptions } from './search.ts';
export { WordShapeText } from './shape-text.ts';

export * from "./structured/index.ts";
export { hasWordParagraphReset, readWordParagraphFormat } from './paragraph-attributes.ts';

export { WORD_DOCUMENT_SETTINGS, readWordDocumentSettings, prepareWordDocumentSettings } from './document-settings.ts';
export { readWordSectionBoundary, sectionPropertyPatch } from './section-attributes.ts';
export { bindWordLayoutSource, validateWordLayout } from './layout-validation.ts';

export { wordTextString } from './text-index.ts';

export { wordTextDelta } from './text-events.ts';
export { restoreWordSourceWhitespace } from './source-whitespace.ts';
export { wordSourceTextRoot, wordSourceTextRedoneRoot } from './source-text.ts';
export { validateWordSourceTextUndo } from './source-text-undo.ts';
export { bindWordSourceReplacement, hasWordSourceReplacement, wordSourceReplacementRoot } from './source-replacement.ts';
