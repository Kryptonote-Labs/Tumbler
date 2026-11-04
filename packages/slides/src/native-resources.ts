import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { readNativeGraph, writeNativeGraph } from '@tumblerjs/opc';
import { z } from 'zod';
import {
  encodePresentationBlock,
  decodePresentationBlock,
  presentationBlockCodecs,
} from './native-block.ts';
import type { NativeSlide } from './native-document.ts';

const hashes = new WeakMap<Uint8Array, string>();
export function presentationResourceHash(bytes: Uint8Array) {
  let hash = hashes.get(bytes);
  if (!hash) {
    hash = bytesToHex(sha256(bytes));
    hashes.set(bytes, hash);
  }
  return hash;
}
const resource = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  length: z.number().int().nonnegative(),
});
const root = z.object({ version: z.literal(1), graph: z.unknown(), resources: z.array(resource) });
const cache = new WeakMap<
  NativeSlide,
  { model: Uint8Array; resources: ReadonlyMap<string, Uint8Array> }
>();

/** Media stays out of semantic slide blocks, so text and shapes can paint before image downloads. */
export function encodeNativeSlide(slide: NativeSlide) {
  const saved = cache.get(slide);
  if (saved) return saved;
  const graph = writeNativeGraph(slide, presentationBlockCodecs, { canonical: true });
  const references = graph.resources.map((bytes) => ({
    hash: presentationResourceHash(bytes),
    length: bytes.length,
  }));
  const result = {
    model: encodePresentationBlock({ version: 1, graph: graph.graph, resources: references }),
    resources: new Map(graph.resources.map((bytes, i) => [references[i]!.hash, bytes])),
  };
  cache.set(slide, result);
  return result;
}
export function presentationSlideResources(model: Uint8Array) {
  return root.parse(decodePresentationBlock(model)).resources;
}
export function decodeNativeSlide(
  model: Uint8Array,
  resources: ReadonlyMap<string, Uint8Array>,
  allowPending = false,
): unknown {
  const parsed = root.parse(decodePresentationBlock(model));
  const bytes = parsed.resources.map((reference) => {
    const bytes = resources.get(reference.hash);
    if (!bytes) {
      if (allowPending) return new Uint8Array();
      throw new Error('Native presentation resource has not loaded.');
    }
    if (bytes.length !== reference.length || presentationResourceHash(bytes) !== reference.hash)
      throw new Error('Native presentation resource checksum mismatch.');
    return bytes;
  });
  return readNativeGraph(parsed.graph, bytes, presentationBlockCodecs);
}
