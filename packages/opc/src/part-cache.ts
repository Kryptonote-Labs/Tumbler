/** Owns verified part bytes. Public readers receive copies so mutation cannot poison the cache. */
export class PartCache {
  readonly #entries = new Map<string, Uint8Array>();
  #size = 0;

  constructor(readonly maximumBytes: number) {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
      throw new RangeError("Cached part byte budget must be a non-negative safe integer.");
    }
  }

  read(key: string, load: () => Uint8Array): Uint8Array {
    const existing = this.#entries.get(key);
    if (existing !== undefined) {
      this.#entries.delete(key);
      this.#entries.set(key, existing);
      return existing.slice();
    }
    const bytes = load();
    if (bytes.byteLength > this.maximumBytes || this.maximumBytes === 0) return bytes;
    while (this.#size + bytes.byteLength > this.maximumBytes) {
      const oldest = this.#entries.entries().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest[0]);
      this.#size -= oldest[1].byteLength;
    }
    this.#entries.set(key, bytes);
    this.#size += bytes.byteLength;
    return bytes.slice();
  }

  clear(): void {
    this.#entries.clear();
    this.#size = 0;
  }
}
