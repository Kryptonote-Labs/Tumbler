import { isDocumentImage } from '../collaboration/images.ts';
import type { TextAttributes } from '../collaboration/formatting.ts';
import type { WordArtifact } from '../artifact.ts';
import type * as Y from 'yjs';

/** Resolve a live image reference and its retained package bytes, when embedded. */
export function readWordImage(text: Y.Text, source: WordArtifact | undefined, id: string) {
  const runs: { insert: string; attributes?: TextAttributes }[] = text.toDelta();
  let offset = 0;
  for (const run of runs) {
    const image = run.attributes?.image;
    if (isDocumentImage(image) && image.id === id && run.insert.includes('\uFFFC')) {
      const original =
        run.attributes?.wordSource === undefined
          ? undefined
          : source?.document.drawings.get(run.attributes.wordSource);
      return {
        image,
        offset: offset + run.insert.indexOf('\uFFFC'),
        ...(original?.kind === 'image' ? { bytes: original.bytes } : {}),
      };
    }
    offset += run.insert.length;
  }
  throw new Error('Image is not present in this document region. Inspect its objects again.');
}
