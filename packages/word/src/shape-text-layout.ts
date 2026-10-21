import { layoutWordStory, type WordLayoutLine, type WordLayoutTable, type WordTextMeasurer } from "./layout.ts";
import { NativeWordDocument } from "./native-document.ts";
import { shapeTextParagraphs } from "./shape-text.ts";
import type { WordAuthoredShape } from "./shapes.ts";
import { resolveWordShapeTextInsets } from './shape-text-insets.ts';

/** @deprecated Historical uniform inset. Use resolveWordShapeTextInsets for DrawingML defaults. */
export const WORD_SHAPE_TEXT_INSET_POINTS = 4.5;

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
  // A text box is one continuous story. Signed insets and vertical alignment can
  // bring text beyond a page-sized prefix back inside the visible shape.
  const story = layoutWordStory({
    blocks: model.blocks,
    drawings: model.drawings,
    listMarkers: model.listMarkers,
    wrapTrailSpaces: model.wrapTrailSpaces,
    paragraphFormat: paragraph => model.paragraphFormat(paragraph),
    runFormat: (paragraph, run) => model.runFormat(paragraph, run),
  }, Math.max(1, Math.round(inner * 20) / 20), measurer);
  const bottom = story.tables.reduce((bottom, table) => Math.max(bottom, table.y + table.height),
    story.lines.reduce((bottom, line) => Math.max(bottom, line.y + line.height), 0));
  const free = innerHeight - bottom;
  return {
    x: inset.left,
    y: inset.top + (shape.textAnchor === "top" ? 0 : shape.textAnchor === "bottom" ? free : free / 2),
    lines: story.lines,
    tables: story.tables,
  };
}
