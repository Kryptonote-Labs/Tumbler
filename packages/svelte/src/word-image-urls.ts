import type { WordImageDrawing } from '@tumblerjs/word';

type Image = Pick<WordImageDrawing, 'elementId' | 'bytes' | 'contentType'>;
interface Entry { image: Image; url: string }

/** Own blob URLs for one viewer, retaining only images still referenced by its DOM. */
export class WordImageUrls {
  private readonly drawings = new Map<number, Set<Entry>>();
  private readonly bytes = new Map<Uint8Array, Entry>();
  private readonly entries = new Set<Entry>();

  get(image: Image): string {
    let candidates = this.drawings.get(image.elementId);
    if (candidates === undefined) {
      candidates = new Set();
      this.drawings.set(image.elementId, candidates);
    }
    const shared = this.bytes.get(image.bytes);
    let previous = shared?.image.contentType === image.contentType ? shared : undefined;
    // Element IDs are local to each XML story. Keep distinct contents for collisions.
    if (previous === undefined) for (const candidate of candidates) {
      if (candidate.image.contentType === image.contentType && sameBytes(candidate.image.bytes, image.bytes)) {
        previous = candidate;
        break;
      }
    }
    if (previous !== undefined) {
      // Keep the latest artifact's identity so repeated rendering does not rescan its bytes.
      if (this.bytes.get(previous.image.bytes) === previous) this.bytes.delete(previous.image.bytes);
      previous.image = image;
      this.bytes.set(image.bytes, previous);
      candidates.add(previous);
      return previous.url;
    }
    const entry = { image, url: URL.createObjectURL(new Blob([Uint8Array.from(image.bytes).buffer], { type: image.contentType })) };
    candidates.add(entry);
    this.bytes.set(image.bytes, entry);
    this.entries.add(entry);
    return entry.url;
  }

  /** Call after the DOM update, never while old image elements still use these URLs. */
  retain(activeUrls: ReadonlySet<string>): void {
    for (const entry of this.entries) {
      if (activeUrls.has(entry.url)) continue;
      URL.revokeObjectURL(entry.url);
      this.entries.delete(entry);
      if (this.bytes.get(entry.image.bytes) === entry) this.bytes.delete(entry.image.bytes);
    }
    for (const [id, candidates] of this.drawings) {
      for (const entry of candidates) if (!this.entries.has(entry)) candidates.delete(entry);
      if (candidates.size === 0) this.drawings.delete(id);
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
