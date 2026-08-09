import { openOpcPackage } from "@tumblerjs/opc";
import type { FormattingAdapter, FormattingCapabilities, FormattingPatch, FormattingState } from "@tumblerjs/core";
import { openWordDocument, type OpenWordDocumentOptions, type WordDocument } from "./document.ts";
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

  replaceText(selection: WordTextSelection, value: string): WordArtifact {
    const bytes = replaceWordText(this.document, selection, value);
    return bytes === this.bytes() ? this : openWordArtifact(bytes);
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

export function openWordArtifact(bytes: Uint8Array, options: OpenWordArtifactOptions = {}): WordArtifact {
  return new WordArtifact(openWordDocument(openOpcPackage(bytes), options));
}
