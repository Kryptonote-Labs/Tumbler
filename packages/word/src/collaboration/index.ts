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
