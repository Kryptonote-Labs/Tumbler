import { layoutWordSource, type WordLayoutLine, type WordLayoutTable, type WordTextMeasurer } from "./layout.ts";
import { NativeWordDocument } from "./native-document.ts";
import { shapeTextParagraphs } from "./shape-text.ts";
import type { WordAuthoredShape } from "./shapes.ts";
import { resolveWordShapeTextInsets } from './shape-text-insets.ts';

/** @deprecated Historical uniform inset. Use resolveWordShapeTextInsets for DrawingML defaults. */
export const WORD_SHAPE_TEXT_INSET_POINTS = 4.5;
// Word's tallest page (22in) bounds how much overflowing text is laid out before clipping.
const STORY_HEIGHT_TWIPS = 31_680;

export interface WordShapeTextLayout {
  /** Lines and tables relative to the text origin `(x, y)` in the shape's frame. */
  readonly x: number;
  readonly y: number;
  readonly lines: readonly WordLayoutLine[];
  readonly tables: readonly WordLayoutTable[];
}

/**
 * Lays out a shape's rich text with the document engine, using the same defaults (Aptos 12pt) as
 * the editor's shape text. Text taller than the frame overflows; painters clip it to the frame.
 */
export function layoutWordShapeText(
  shape: Pick<WordAuthoredShape, "text" | "textBody" | "textAnchor" | "textInsets">,
  width: number,
  height: number,
  measurer: WordTextMeasurer,
): WordShapeTextLayout {
  const paragraphs = shapeTextParagraphs(shape);
  const inset = resolveWordShapeTextInsets(shape);
  const inner = width - inset.left - inset.right;
  const innerHeight = height - inset.top - inset.bottom;
  const empty = { x: inset.left, y: inset.top, lines: [], tables: [] } as const satisfies WordShapeTextLayout;
  if (inner <= 0 || innerHeight <= 0 || paragraphs.every(paragraph => paragraph.runs.every(run => run.text === ""))) return empty;
  const model = new NativeWordDocument({ defaultFormat: { fontFamily: "Aptos", fontSizePoints: 12 } });
  model.update(paragraphs.map(paragraph => ({ kind: "paragraph", ...paragraph })));
  const twips = Math.max(1, Math.round(inner * 20));
  const { pages } = layoutWordSource({
    blocks: model.blocks,
    drawings: model.drawings,
    listMarkers: model.listMarkers,
    wrapTrailSpaces: model.wrapTrailSpaces,
    finalSection: { ...model.finalSection, pageWidthTwips: twips, pageHeightTwips: STORY_HEIGHT_TWIPS, marginTopTwips: 0, marginRightTwips: 0, marginBottomTwips: 0, marginLeftTwips: 0, headerDistanceTwips: 0, footerDistanceTwips: 0, gutterTwips: 0, columnCount: 1, headerReferences: [], footerReferences: [] },
    paragraphFormat: paragraph => model.paragraphFormat(paragraph),
    runFormat: (paragraph, run) => model.runFormat(paragraph, run),
  }, measurer, { pageLimit: 1 });
  const column = pages[0]?.columns[0];
  if (!column) return empty;
  const bottom = Math.max(0, ...column.lines.map(line => line.y + line.height), ...column.tables.map(table => table.y + table.height));
  const free = innerHeight - bottom;
  return {
    x: inset.left,
    y: inset.top + (shape.textAnchor === "top" ? 0 : shape.textAnchor === "bottom" ? free : free / 2),
    lines: column.lines,
    tables: column.tables,
  };
}
