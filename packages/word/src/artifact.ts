import { openOpcPackage } from "@tumblerjs/opc";
import { openWordDocument, type OpenWordDocumentOptions, type WordDocument } from "./document.ts";

export interface OpenWordArtifactOptions extends OpenWordDocumentOptions {}

/** Immutable host boundary for a WordprocessingML artefact and external revisions. */
export class WordArtifact {
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
}

export function openWordArtifact(bytes: Uint8Array, options: OpenWordArtifactOptions = {}): WordArtifact {
  return new WordArtifact(openWordDocument(openOpcPackage(bytes), options));
}
