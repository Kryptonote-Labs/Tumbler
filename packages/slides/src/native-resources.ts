import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { readNativeGraph, writeNativeGraph } from '@tumblerjs/opc';
import { z } from 'zod';
import { LosslessXmlDocument } from '@tumblerjs/ooxml';
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
const nativeSlide = z.custom<NativeSlide>(
  (v: unknown) =>
    !!v &&
    typeof v === 'object' &&
    'slide' in v &&
    !!v.slide &&
    typeof v.slide === 'object' &&
    'id' in v.slide &&
    typeof v.slide.id === 'string' &&
    'objects' in v.slide &&
    Array.isArray(v.slide.objects) &&
    'palette' in v &&
    Array.isArray(v.palette),
);
const pendingResources = new WeakMap<Uint8Array, z.infer<typeof resource>>();
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
  const references = graph.resources.map(
    (bytes) =>
      pendingResources.get(bytes) ?? {
        hash: presentationResourceHash(bytes),
        length: bytes.length,
      },
  );
  const result = {
    model: encodePresentationBlock({ version: 1, graph: graph.graph, resources: references }),
    resources: new Map(
      graph.resources.flatMap((bytes, i) =>
        pendingResources.has(bytes) ? [] : [[references[i]!.hash, bytes] as const],
      ),
    ),
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
): NativeSlide {
  const parsed = root.parse(decodePresentationBlock(model));
  const bytes = parsed.resources.map((reference) => {
    const bytes = resources.get(reference.hash);
    if (!bytes) {
      if (allowPending) {
        const placeholder = new Uint8Array();
        pendingResources.set(placeholder, reference);
        return placeholder;
      }
      throw new Error('Native presentation resource has not loaded.');
    }
    if (bytes.length !== reference.length || presentationResourceHash(bytes) !== reference.hash)
      throw new Error('Native presentation resource checksum mismatch.');
    return bytes;
  });
  return nativeSlide.parse(readNativeGraph(parsed.graph, bytes, presentationBlockCodecs));
}

/** Inspect resource handles without parsing preserved XML or changing unrelated model identities. */
export function hasAvailablePresentationResources(
  value: unknown,
  resources: ReadonlyMap<string, Uint8Array>,
): boolean {
  const seen = new WeakSet<object>();
  function visit(value: unknown): boolean {
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    if (value instanceof Uint8Array) {
      const reference = pendingResources.get(value);
      return !!reference && resources.has(reference.hash);
    }
    if (value instanceof LosslessXmlDocument) return visit(value.originalBytes());
    if (value instanceof Map) {
      for (const [key, member] of value) if (visit(key) || visit(member)) return true;
      return false;
    }
    return Object.values(value).some(visit);
  }
  return visit(value);
}
