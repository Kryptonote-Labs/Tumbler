import type { WordDocument, WordInline, WordParagraph, WordRun } from "./document.ts";

export interface WordTextPosition {
  readonly paragraphElementId: number;
  /** UTF-16 offset in the paragraph's visible logical text stream. */
  readonly offset: number;
  readonly affinity?: "before" | "after";
}

export interface WordTextSelection {
  readonly anchor: WordTextPosition;
  readonly focus: WordTextPosition;
}

export interface WordParagraphTextSegment {
  readonly tab?: import("./document.ts").WordPositionalTab;
  readonly breakType?: import('./breaks.ts').WordBreakType;
  readonly kind: "text" | "symbol" | "tab" | "break" | "drawing" | "note" | "page-field";
  readonly field?: import("./page-fields.ts").WordPageField;
  readonly symbolFont?: string;
  /** Additional source elements owned by a projected complex field. */
  readonly replacedElementIds?: readonly number[];
  readonly elementId: number;
  readonly runElementId: number;
  readonly start: number;
  readonly end: number;
  readonly value: string;
}

export function wordParagraphText(document: WordDocument | undefined, paragraph: WordParagraph): string {
  return wordParagraphTextSegments(document, paragraph).map((segment) => segment.value).join("");
}

/** Maps logical text offsets back to exact run-content source elements. */
export function wordParagraphTextSegments(_document: WordDocument | undefined, paragraph: WordParagraph): readonly WordParagraphTextSegment[] {
  const segments: WordParagraphTextSegment[] = [];
  let offset = 0;
  const fieldResults: boolean[] = [];
  let instructionDepth = 0;
  const addRun = (run: WordRun): void => {
    for (const content of run.contents) {
      if (content.kind === "field-character") {
        if (content.fieldType === "begin") {
          fieldResults.push(false);
          instructionDepth += 1;
        } else if (content.fieldType === "separate" && fieldResults.at(-1) === false) {
          fieldResults[fieldResults.length - 1] = true;
          instructionDepth -= 1;
        } else if (content.fieldType === "end" && fieldResults.pop() === false) {
          instructionDepth -= 1;
        }
        continue;
      }
      if (content.kind === "field-instruction" || content.kind === "deleted-text" || instructionDepth > 0) continue;
      const projected = content.kind === "page-field" ? { kind: "page-field" as const, value: "\uFFFC" }
        : content.kind === "text" ? { kind: "text" as const, value: content.value }
        : content.kind === "symbol" ? { kind: "symbol" as const, value: content.value }
        : content.kind === "tab" ? { kind: "tab" as const, value: "\t" }
        : content.kind === "break" ? { kind: "break" as const, value: "\n", breakType: content.breakType }
        : content.kind === "drawing" ? { kind: "drawing" as const, value: "\uFFFC" }
        : content.kind === "footnote-reference" || content.kind === "endnote-reference" ? { kind: "note" as const, value: "\uFFFC" }
        : undefined;
      if (projected === undefined) continue;
      const start = offset;
      offset += projected.value.length;
      segments.push(Object.freeze({
        kind: projected.kind,
        ...(content.kind === "symbol" && !content.unicodeFallback ? { symbolFont: content.fontFamily } : {}),
        ...(content.kind === "break" ? { breakType: content.breakType } : {}),
        ...(content.kind === "tab" && content.position ? { tab: content.position } : {}),
        ...(content.kind === "page-field" ? { field: content.field, ...(content.replacedElementIds ? { replacedElementIds: content.replacedElementIds } : {}) } : {}),
        elementId: content.elementId,
        runElementId: run.elementId,
        start,
        end: offset,
        value: projected.value,
      }));
    }
  };
  const addInline = (inline: WordInline): void => {
    if (inline.kind === "run") addRun(inline);
    else if (inline.kind === "hyperlink" || inline.kind === "insertion") inline.runs.forEach(addRun);
  };
  paragraph.inlines.forEach(addInline);
  return Object.freeze(segments);
}
