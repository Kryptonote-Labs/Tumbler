import * as Y from "yjs";
import type { WordArtifact } from "../../artifact.ts";
import type { WordContentBlock } from "../../create-content.ts";
import type { DocumentImage } from "../images.ts";
import { projectWordOperationText } from "../../operations/document.ts";
import { projectWordSharedText } from "./view-projection.ts";

/** Export the same logical paragraphs and table ownership that editors display. */
export function projectWordSharedDocument(
  doc: Y.Doc,
  story: string,
  source: WordArtifact,
  resolveImage?: (image: DocumentImage) => Uint8Array,
): WordContentBlock[] {
  const projected = projectWordSharedText(doc, story);
  const temporary = new Y.Doc();
  try {
    const text = temporary.getText("story");
    text.applyDelta(projected.delta);
    return projectWordOperationText(text, source, resolveImage);
  } finally {
    temporary.destroy();
  }
}

/** Invalidate on any shared-root update, including first typing in an implicit cell. */
export class WordStructuredProjection {
  private cached: WordContentBlock[] | undefined;
  private readonly invalidate = () => {
    this.cached = undefined;
  };
  constructor(
    private readonly doc: Y.Doc,
    private readonly story: string,
    private readonly source: WordArtifact,
    private readonly resolveImage?: (image: DocumentImage) => Uint8Array,
  ) {
    doc.on("update", this.invalidate);
  }
  get blocks() {
    return (this.cached ??= projectWordSharedDocument(
      this.doc,
      this.story,
      this.source,
      this.resolveImage,
    ));
  }
  destroy() {
    this.doc.off("update", this.invalidate);
  }
}
