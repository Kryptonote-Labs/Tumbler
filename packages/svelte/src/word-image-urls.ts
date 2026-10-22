import type { WordImageDrawing } from '@tumblerjs/word';

type Image = Pick<WordImageDrawing, 'elementId' | 'bytes' | 'contentType'>;
interface Entry { image: Image; url: string }

/** Own blob URLs for one viewer, retaining only images still referenced by its DOM. */
export class WordImageUrls {
  private readonly drawings = new Map<number, Entry>();
  private readonly entries = new Set<Entry>();

  get(image: Image): string {
    const previous = this.drawings.get(image.elementId);
    if (previous !== undefined && previous.image.contentType === image.contentType && sameBytes(previous.image.bytes, image.bytes)) {
      // Keep the latest artifact's identity so repeated rendering does not rescan its bytes.
      previous.image = image;
      return previous.url;
    }
    const entry = { image, url: URL.createObjectURL(new Blob([Uint8Array.from(image.bytes).buffer], { type: image.contentType })) };
    this.drawings.set(image.elementId, entry);
    this.entries.add(entry);
    return entry.url;
  }

  /** Call after the DOM update, never while old image elements still use these URLs. */
  retain(activeUrls: ReadonlySet<string>): void {
    for (const entry of this.entries) {
      if (activeUrls.has(entry.url)) continue;
      URL.revokeObjectURL(entry.url);
      this.entries.delete(entry);
      if (this.drawings.get(entry.image.elementId) === entry) this.drawings.delete(entry.image.elementId);
    }
  }

  destroy(): void {
    this.retain(new Set());
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return false;
  return true;
}
