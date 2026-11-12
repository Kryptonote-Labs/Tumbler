export { default as WordInkPageLayer } from "./WordInkPageLayer.svelte";
/** Replaceable Svelte heads for Tumbler's format packages. */
/** Owned Svelte heads for Tumbler's format-neutral document models. */
export { default as SpreadsheetGrid } from "./SpreadsheetGrid.svelte";
export { default as SpreadsheetFormulaBar } from "./SpreadsheetFormulaBar.svelte";
export { default as FormattingToolbar } from "./FormattingToolbar.svelte";
export { default as OoxmlChart } from "./OoxmlChart.svelte";
export { default as WordDrawingView } from "./WordDrawingView.svelte";
export { default as WordDocumentView } from "./WordDocumentView.svelte";
export { browserWordTextMeasurer, wordTextCss, wordTextTop } from "./word-font-metrics.ts";
export { browserWordLineMetrics } from './word-line-metrics.ts';
export { browserWordBaselineOffset } from './word-baseline.ts';
export { calculateWordPageViewport } from "./word-page-viewport.ts";
export type { WordPageViewport } from "./word-page-viewport.ts";
export { wordDocumentParagraphs, wordInputEdit } from "./word-editing.ts";
export type { WordDocumentEdit, WordInputEdit } from "./word-editing.ts";
export { openWordArtifact, openWordEditingSession, WordArtifact, WordEditingSession, WORD_FORMATTING_CAPABILITIES } from "@tumblerjs/word";
export type { WordDocument, WordTextPosition, WordTextSelection } from "@tumblerjs/word";
export {
  measureMaximumDigitWidth,
  spreadsheetFontShorthand,
} from "./spreadsheet-font-metrics.ts";
export {
  spreadsheetCellContentCss,
  spreadsheetCellCss,
} from "./spreadsheet-cell-style.ts";
export { calculateSpreadsheetViewport } from "./spreadsheet-viewport.ts";
export type {
  SpreadsheetViewport,
  SpreadsheetViewportInput,
  VirtualGridItem,
} from "./spreadsheet-viewport.ts";
export { composeSpreadsheetGridLayout, frozenGridTranslation, placeSpreadsheetDrawing, spreadsheetDrawingRegion } from "./spreadsheet-grid-layout.ts";
export type { SpreadsheetDrawingViewportPlacement, SpreadsheetGridLayout, SpreadsheetMergeLayout } from "./spreadsheet-grid-layout.ts";
export { coerceSpreadsheetEditValue, spreadsheetCellUsesTextFormat } from "./spreadsheet-edit.ts";
export type { SpreadsheetGridEdit } from "./spreadsheet-edit.ts";
export { insertSpreadsheetFormulaFunction, spreadsheetFormulaBarEdit, spreadsheetFormulaBarText } from "./spreadsheet-formula-bar.ts";
export type { SpreadsheetFormulaBarEdit, SpreadsheetFormulaFunctionInsertion } from "./spreadsheet-formula-bar.ts";
export {
  insertSpreadsheetFormulaReference,
  spreadsheetFormulaReferenceText,
} from "./spreadsheet-formula-reference.ts";
export type {
  SpreadsheetFormulaReferenceInsertion,
  SpreadsheetFormulaReferencePick,
  SpreadsheetFormulaTextSpan,
} from "./spreadsheet-formula-reference.ts";
export {
  colorFormatting,
  fontFamilyFormatting,
  fontSizeFormatting,
  formattingColorValue,
  toggleBooleanFormatting,
  toggleUnderlineFormatting,
} from "./formatting-controls.ts";

export { wordTableBorderCss } from './word-table-style.ts';

export { wordHighlightColor } from '@tumblerjs/word';

export { default as WordParagraphDecorations } from './WordParagraphDecorations.svelte';
export { default as WordShapeView } from './WordShapeView.svelte';

export type { ShapeTextEditor } from './word-shape-text-editor.ts';

export { wordDarkColour, wordDisplayColour, wordDisplaySurface } from './word-display-colour.ts';
export { default as WordPageLayoutDecorations } from './WordPageLayoutDecorations.svelte';

export { loadEmbeddedFonts, type EmbeddedFont, type EmbeddedFontContext, type EmbeddedFontLoadResult } from './embedded-fonts.ts';

export { default as SpreadsheetPrintView } from './SpreadsheetPrintView.svelte';

export { spreadsheetFormulaCompletion, acceptSpreadsheetFormulaCompletion } from "./spreadsheet-formula-completion.ts";
export type { SpreadsheetFormulaCompletion } from "./spreadsheet-formula-completion.ts";

export { default as ChartProperties } from "./ChartProperties.svelte";
export { default as ChartPropertyFields } from "./ChartPropertyFields.svelte";
export { default as ChartDataEditor } from "./ChartDataEditor.svelte";
export { CHART_TYPE_FAMILIES } from "./chart-properties.ts";
export type { ChartTypeChange, ChartTypeFamily, ChartTypeOption, ChartPropertyApply, ChartPropertyChange } from "./chart-properties.ts";
export { default as ChartWorkbench } from './ChartWorkbench.svelte';

export type { WordLayoutProgress, WordLayoutError } from "./word-layout-job.ts";
