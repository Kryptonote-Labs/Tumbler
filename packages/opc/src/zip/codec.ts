import { deflateSync, inflateSync } from "fflate";

/** Browser codec. Native hosts select codec-node through the package import condition. */
export function inflateRaw(bytes: Uint8Array, size: number): Uint8Array {
  return inflateSync(bytes, { out: new Uint8Array(size) });
}

export function deflateRaw(bytes: Uint8Array): Uint8Array {
  return deflateSync(bytes, { level: 6 });
}
