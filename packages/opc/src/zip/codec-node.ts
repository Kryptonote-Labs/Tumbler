import { deflateRawSync, inflateRawSync } from "node:zlib";

/** Keep the declared entry bound during decompression, including empty ZIP entries. */
export function inflateRaw(bytes: Uint8Array, size: number): Uint8Array {
  return inflateRawSync(bytes, { maxOutputLength: Math.max(1, size) });
}

export function deflateRaw(bytes: Uint8Array): Uint8Array {
  return deflateRawSync(bytes, { level: 6 });
}
