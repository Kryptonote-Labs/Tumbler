import { wordParagraphText, type WordDocument, type WordParagraph, type WordTextPosition, type WordTextSelection } from "@tumblerjs/word";

export interface WordInputEdit {
  readonly selection: WordTextSelection;
  readonly value: string;
  readonly caret: WordTextPosition;
}

export type WordDocumentEdit = WordInputEdit;

/** Converts a browser input intent into one logical Word edit without trusting DOM mutations. */
export function wordInputEdit(
  document: WordDocument,
  selection: WordTextSelection,
  inputType: string,
  data: string | null,
): WordInputEdit | undefined {
  const ordered = orderSelection(document, selection);
  if (inputType === "insertText" || inputType === "insertCompositionText" || inputType === "insertFromPaste") {
    const value = data ?? "";
    return edit(ordered, value, caretAfterInsertion(ordered, value));
  }
  if (inputType === "insertParagraph" || inputType === "insertLineBreak") {
    return edit(ordered, "\n", caretAfterInsertion(ordered, "\n"));
  }
  if (inputType === "deleteContentBackward" || inputType === "deleteWordBackward") {
    const expanded = collapsed(selection)
      ? previousGraphemeSelection(document, ordered.anchor)
      : ordered;
    return expanded === undefined ? undefined : edit(expanded, "", expanded.anchor);
  }
  if (inputType === "deleteContentForward" || inputType === "deleteWordForward") {
    const expanded = collapsed(selection)
      ? nextGraphemeSelection(document, ordered.focus)
      : ordered;
    return expanded === undefined ? undefined : edit(expanded, "", expanded.anchor);
  }
  return undefined;
}

export function wordDocumentParagraphs(document: WordDocument): readonly WordParagraph[] {
  const paragraphs: WordParagraph[] = [];
  const visit = (blocks: WordDocument["blocks"]): void => {
    for (const block of blocks) {
      if (block.kind === "paragraph") paragraphs.push(block);
      else if (block.kind === "table") for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks);
    }
  };
  visit(document.blocks);
  return paragraphs;
}

function edit(selection: WordTextSelection, value: string, caret: WordTextPosition): WordInputEdit {
  return Object.freeze({ selection, value, caret });
}

function collapsed(selection: WordTextSelection): boolean {
  return selection.anchor.paragraphElementId === selection.focus.paragraphElementId &&
    selection.anchor.offset === selection.focus.offset;
}

function orderSelection(document: WordDocument, selection: WordTextSelection): WordTextSelection {
  const paragraphs = wordDocumentParagraphs(document);
  const anchor = paragraphs.findIndex((paragraph) => paragraph.elementId === selection.anchor.paragraphElementId);
  const focus = paragraphs.findIndex((paragraph) => paragraph.elementId === selection.focus.paragraphElementId);
  if (anchor < 0 || focus < 0) return selection;
  if (anchor < focus || anchor === focus && selection.anchor.offset <= selection.focus.offset) return selection;
  return Object.freeze({ anchor: selection.focus, focus: selection.anchor });
}

function previousGraphemeSelection(document: WordDocument, position: WordTextPosition): WordTextSelection | undefined {
  const paragraphs = wordDocumentParagraphs(document);
  const index = paragraphs.findIndex((paragraph) => paragraph.elementId === position.paragraphElementId);
  const paragraph = paragraphs[index];
  if (paragraph === undefined) return undefined;
  const text = wordParagraphText(document, paragraph);
  const boundary = boundaries(text).findLast((offset) => offset < position.offset);
  if (boundary !== undefined) return { anchor: { ...position, offset: boundary }, focus: position };
  const previous = paragraphs[index - 1];
  if (previous === undefined) return undefined;
  return {
    anchor: { paragraphElementId: previous.elementId, offset: wordParagraphText(document, previous).length },
    focus: position,
  };
}

function nextGraphemeSelection(document: WordDocument, position: WordTextPosition): WordTextSelection | undefined {
  const paragraphs = wordDocumentParagraphs(document);
  const index = paragraphs.findIndex((paragraph) => paragraph.elementId === position.paragraphElementId);
  const paragraph = paragraphs[index];
  if (paragraph === undefined) return undefined;
  const text = wordParagraphText(document, paragraph);
  const boundary = boundaries(text).find((offset) => offset > position.offset);
  if (boundary !== undefined) return { anchor: position, focus: { ...position, offset: boundary } };
  const next = paragraphs[index + 1];
  if (next === undefined) return undefined;
  return { anchor: position, focus: { paragraphElementId: next.elementId, offset: 0 } };
}

function caretAfterInsertion(selection: WordTextSelection, value: string): WordTextPosition {
  const lines = value.split("\n");
  return lines.length === 1
    ? { paragraphElementId: selection.anchor.paragraphElementId, offset: selection.anchor.offset + value.length }
    : { paragraphElementId: selection.anchor.paragraphElementId, offset: lines.at(-1)!.length };
}

function boundaries(value: string): number[] {
  const result = new Set<number>([0, value.length]);
  const Segmenter = Intl.Segmenter;
  if (Segmenter === undefined) {
    let offset = 0;
    for (const scalar of value) {
      offset += scalar.length;
      result.add(offset);
    }
  } else {
    for (const segment of new Segmenter(undefined, { granularity: "grapheme" }).segment(value)) {
      result.add(segment.index);
      result.add(segment.index + segment.segment.length);
    }
  }
  return [...result].sort((left, right) => left - right);
}
