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
import { refreshNativeChartProjection } from './native-chart-projection.ts';

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
  return refreshNativeChartProjection(nativeSlide.parse(readNativeGraph(parsed.graph, bytes, presentationBlockCodecs)));
}

/** Resolve only arriving binary handles; untouched text, geometry and shared theme objects keep their identity. */
export function resolvePresentationResources<T>(
  value: T,
  resources: ReadonlyMap<string, Uint8Array>,
): T;
export function resolvePresentationResources(
  value: unknown,
  resources: ReadonlyMap<string, Uint8Array>,
): unknown {
  const available = new WeakMap<object, boolean>(),
    ancestors = new WeakSet<object>(),
    resolved = new WeakMap<object, unknown>();
  let cyclic = false;
  function has(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const saved = available.get(value);
    if (saved !== undefined) return saved;
    if (ancestors.has(value)) {
      cyclic = true;
      return false;
    }
    ancestors.add(value);
    let result: boolean;
    if (value instanceof Uint8Array) {
      const reference = pendingResources.get(value);
      result = !!reference && resources.has(reference.hash);
    } else if (value instanceof LosslessXmlDocument) result = has(value.originalBytes());
    else if (value instanceof Map) {
      result = false;
      for (const [key, member] of value)
        if (has(key) || has(member)) {
          result = true;
          break;
        }
    } else result = Object.values(value).some(has);
    ancestors.delete(value);
    if (!cyclic) available.set(value, result);
    return result;
  }
  function visit(value: unknown): unknown {
    if (!value || typeof value !== 'object' || !has(value)) return value;
    if (resolved.has(value)) return resolved.get(value);
    if (value instanceof Uint8Array) {
      const reference = pendingResources.get(value)!;
      const bytes = resources.get(reference.hash)!;
      if (bytes.length !== reference.length || presentationResourceHash(bytes) !== reference.hash)
        throw new Error('Native presentation resource checksum mismatch.');
      resolved.set(value, bytes);
      return bytes;
    }
    if (value instanceof LosslessXmlDocument) {
      const bytes = visit(value.originalBytes());
      if (!(bytes instanceof Uint8Array)) throw new Error('Invalid native XML resource.');
      const document = new LosslessXmlDocument(bytes);
      resolved.set(value, document);
      return document;
    }
    if (Array.isArray(value)) {
      const output: unknown[] = [];
      resolved.set(value, output);
      for (const member of value) output.push(visit(member));
      return output;
    }
    if (value instanceof Map) {
      const output = new Map<unknown, unknown>();
      resolved.set(value, output);
      for (const [key, member] of value) output.set(visit(key), visit(member));
      return output;
    }
    const output: Record<string, unknown> = Object.create(Object.getPrototypeOf(value));
    resolved.set(value, output);
    for (const [key, member] of Object.entries(value))
      Object.defineProperty(output, key, {
        value: visit(member),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    return output;
  }
  return visit(value);
}
