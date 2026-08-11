import { openOpcPackage } from "@tumblerjs/opc";
import type { FormattingAdapter, FormattingCapabilities, FormattingPatch, FormattingState, FormattingValue, OfficeColor } from "@tumblerjs/core";
import { openWordDocument, type OpenWordDocumentOptions, type WordBlock, type WordDocument, type WordParagraph } from "./document.ts";
import { replaceWordText } from "./editor.ts";
import { formatWordSelection, wordFormattingState, WORD_FORMATTING_CAPABILITIES, type WordFormattingTarget } from "./formatting.ts";
import type { WordTextSelection } from "./text.ts";

export interface OpenWordArtifactOptions extends OpenWordDocumentOptions {}

/** Immutable host boundary for a WordprocessingML artefact and external revisions. */
export class WordArtifact implements FormattingAdapter<WordFormattingTarget, WordArtifact> {
  readonly document: WordDocument;

  constructor(document: WordDocument) {
    this.document = document;
  }

  bytes(): Uint8Array {
    return this.document.bytes();
  }

  replace(bytes: Uint8Array, options: OpenWordArtifactOptions = {}): WordArtifact {
    if (bytes === this.bytes()) return this;
    return openWordArtifact(bytes, options);
  }

  replaceText(selection: WordTextSelection, value: string, typingFormatting?: FormattingPatch): WordArtifact {
    const paragraphIndex = selection.anchor.paragraphElementId === selection.focus.paragraphElementId && !value.includes("\n")
      ? documentParagraphs(this.document).findIndex((paragraph) => paragraph.elementId === selection.anchor.paragraphElementId)
      : -1;
    const insertedStart = Math.min(selection.anchor.offset, selection.focus.offset);
    const bytes = replaceWordText(this.document, selection, value);
    if (bytes === this.bytes()) return this;
    let next = openWordArtifact(bytes);
    const textFormatting = typingFormatting?.text;
    if (paragraphIndex < 0 || value.length === 0 || textFormatting === undefined || Object.keys(textFormatting).length === 0) return next;
    const paragraph = documentParagraphs(next.document)[paragraphIndex];
    if (paragraph === undefined) return next;
    const inserted = {
      anchor: { paragraphElementId: paragraph.elementId, offset: insertedStart },
      focus: { paragraphElementId: paragraph.elementId, offset: insertedStart + value.length },
    };
    if (!textFormattingMatches(next.formattingState(inserted), textFormatting)) {
      next = next.applyFormatting(inserted, { text: textFormatting });
    }
    return next;
  }

  formattingCapabilities(_target: WordFormattingTarget): FormattingCapabilities {
    return WORD_FORMATTING_CAPABILITIES;
  }

  formattingState(target: WordFormattingTarget): FormattingState {
    return wordFormattingState(this.document, target);
  }

  applyFormatting(target: WordFormattingTarget, patch: FormattingPatch): WordArtifact {
    const bytes = formatWordSelection(this.document, target, patch);
    return bytes === this.bytes() ? this : openWordArtifact(bytes);
  }
}

function documentParagraphs(document: WordDocument): readonly WordParagraph[] {
  const paragraphs: WordParagraph[] = [];
  const visit = (blocks: readonly WordBlock[]) => {
    for (const block of blocks) {
      if (block.kind === "paragraph") paragraphs.push(block);
      else if (block.kind === "table") for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks);
    }
  };
  visit(document.blocks);
  return paragraphs;
}

function textFormattingMatches(state: FormattingState, patch: NonNullable<FormattingPatch["text"]>): boolean {
  return matches(state.text.fontFamily, patch.fontFamily) &&
    matches(state.text.fontSize, patch.fontSize) &&
    matches(state.text.bold, patch.bold) &&
    matches(state.text.italic, patch.italic) &&
    matches(state.text.underline, patch.underline) &&
    matches(state.text.color, patch.color, officeColorEqual);
}

function matches<T>(
  state: FormattingValue<T>,
  change: { readonly set: T } | { readonly inherit: true } | undefined,
  equal: (left: T, right: T) => boolean = Object.is,
): boolean {
  if (change === undefined) return true;
  if ("inherit" in change) return state.state === "inherited";
  return (state.state === "value" || state.state === "inherited") && equal(state.value, change.set);
}

function officeColorEqual(left: OfficeColor, right: OfficeColor): boolean {
  return left.type === right.type && (left.type === "automatic" || right.type === "automatic" || left.value === right.value);
}

export function openWordArtifact(bytes: Uint8Array, options: OpenWordArtifactOptions = {}): WordArtifact {
  return new WordArtifact(openWordDocument(openOpcPackage(bytes), options));
}
