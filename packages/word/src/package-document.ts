import { NativeWordDocument } from './native-document.ts';
import { importWordContent } from './import-content.ts';
import type { WordArtifact } from './artifact.ts';
export { reconcileWordContent, wordContentParagraphs } from './content-export.ts';

/** Compatibility name. Imported documents use the same native engine as newly authored ones. */
export class WordPackageDocument extends NativeWordDocument {
  readonly original;
  constructor(readonly source: WordArtifact) {
    super({ source });
    this.original = importWordContent(source);
  }
}
