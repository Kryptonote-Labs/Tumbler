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
  readonly kind: "text" | "tab" | "break" | "drawing" | "note";
  readonly elementId: number;
  readonly runElementId: number;
  readonly start: number;
  readonly end: number;
  readonly value: string;
}

export function wordParagraphText(document: WordDocument, paragraph: WordParagraph): string {
  return wordParagraphTextSegments(document, paragraph).map((segment) => segment.value).join("");
}

/** Maps logical text offsets back to exact run-content source elements. */
export function wordParagraphTextSegments(_document: WordDocument, paragraph: WordParagraph): readonly WordParagraphTextSegment[] {
  const segments: WordParagraphTextSegment[] = [];
  let offset = 0;
  let fieldDepth = 0;
  let resultDepth = 0;
  const addRun = (run: WordRun): void => {
    for (const content of run.contents) {
      if (content.kind === "field-character") {
        if (content.fieldType === "begin") fieldDepth += 1;
        else if (content.fieldType === "separate" && fieldDepth > 0) resultDepth = fieldDepth;
        else if (content.fieldType === "end") {
          if (resultDepth === fieldDepth) resultDepth = 0;
          fieldDepth = Math.max(0, fieldDepth - 1);
        }
        continue;
      }
      if (content.kind === "field-instruction" || content.kind === "deleted-text" || fieldDepth > 0 && resultDepth !== fieldDepth) continue;
      const projected = content.kind === "text" ? { kind: "text" as const, value: content.value }
        : content.kind === "tab" ? { kind: "tab" as const, value: "\t" }
        : content.kind === "break" ? { kind: "break" as const, value: "\n" }
        : content.kind === "drawing" ? { kind: "drawing" as const, value: "\uFFFC" }
        : content.kind === "footnote-reference" || content.kind === "endnote-reference" ? { kind: "note" as const, value: "\uFFFC" }
        : undefined;
      if (projected === undefined) continue;
      const start = offset;
      offset += projected.value.length;
      segments.push(Object.freeze({
        kind: projected.kind,
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
