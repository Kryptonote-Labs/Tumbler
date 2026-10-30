import { deflateRaw, inflateRaw } from '@tumblerjs/opc/compression';
import { crc32 } from '@tumblerjs/opc';
import * as z from 'zod';
import { WordArtifact, openWordArtifact } from './artifact.ts';
import { WordDocument } from './document.ts';
import { NativeWordSource, nativeWordSource } from './native-source.ts';
import { bindWordStoryArtifact, wordStoryArtifact } from './stories.ts';
import { wordNativeCodecs } from './native-codecs.ts';
import { readNativeGraph, writeNativeGraph } from './native-graph.ts';
import type { WordContentBlock } from './create-content.ts';

/** Immutable native semantics and preservation resources. Hosts store these outside the edit log. */
export interface WordNativeArchive {
  readonly version: 1;
  readonly model: Uint8Array;
  readonly resources: readonly Uint8Array[];
}
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const magic = encoder.encode('TMBWORD1');
const metadata = z.object({ version: z.literal(1), graph: z.unknown(), resources: z.array(z.object({
  length: z.number().int().nonnegative(), crc32: z.number().int().nonnegative(),
  compression: z.enum(['raw', 'deflate']), storedLength: z.number().int().nonnegative(), storedCrc32: z.number().int().nonnegative(),
})) }).strict();
const root = z.object({ artifact: z.instanceof(WordArtifact), compiled: z.array(z.instanceof(NativeWordSource)) });

/** Compile once at import. Every package member and lossless XML node remains owned by the archive. */
export function createWordNativeArchive(artifact: WordArtifact): WordNativeArchive {
  const compiled = [nativeWordSource(artifact), ...artifact.document.headerFooters.map(story =>
    nativeWordSource(wordStoryArtifact(artifact, story.part.name.value)))];
  const { graph, resources: original } = writeNativeGraph({ artifact, compiled }, wordNativeCodecs);
  const entries = original.map(bytes => {
    const compressed = deflateRaw(bytes);
    const compression = compressed.byteLength + 16 < bytes.byteLength ? 'deflate' as const : 'raw' as const;
    const stored = compression === 'deflate' ? compressed : bytes;
    return { stored, metadata: { length: bytes.byteLength, crc32: crc32(bytes), compression,
      storedLength: stored.byteLength, storedCrc32: crc32(stored) } };
  });
  const rawModel = encoder.encode(JSON.stringify({ version: 1, graph,
    resources: entries.map(entry => entry.metadata),
  }));
  const compressedModel = deflateRaw(rawModel);
  const model = new Uint8Array(8 + compressedModel.byteLength);
  new DataView(model.buffer).setFloat64(0, rawModel.byteLength, true);
  model.set(compressedModel, 8);
  return { version: 1, model, resources: entries.map(entry => entry.stored) };
}

/** Reopen compiled semantics, rebuilding legacy projections from preservation bytes when needed. */
export function openWordNativeArchive(archive: WordNativeArchive): WordArtifact {
  if (archive.version !== 1) throw new TypeError('Unsupported native Word version.');
  if (archive.model.byteLength < 8) throw new TypeError('Truncated native Word model.');
  const modelLength = new DataView(archive.model.buffer, archive.model.byteOffset, archive.model.byteLength).getFloat64(0, true);
  if (!Number.isSafeInteger(modelLength) || modelLength < 1) throw new TypeError('Invalid native Word model length.');
  const model = inflateRaw(archive.model.subarray(8), modelLength);
  if (model.byteLength !== modelLength) throw new TypeError('Native Word model length mismatch.');
  const data = metadata.parse(JSON.parse(decoder.decode(model)));
  if (data.resources.length !== archive.resources.length || data.resources.some((resource, index) => {
    const bytes = archive.resources[index];
    return !bytes || bytes.byteLength !== resource.storedLength || crc32(bytes) !== resource.storedCrc32;
  })) throw new TypeError('Native Word resource integrity check failed.');
  const resources = data.resources.map((resource, index) => {
    const stored = archive.resources[index]!;
    const bytes = resource.compression === 'deflate' ? inflateRaw(stored, resource.length) : stored;
    if (bytes.byteLength !== resource.length || crc32(bytes) !== resource.crc32)
      throw new TypeError('Native Word resource integrity check failed.');
    return bytes;
  });
  const restored = root.parse(readNativeGraph(data.graph, resources, wordNativeCodecs));
  if (!(restored.artifact.document instanceof WordDocument)) throw new TypeError('Invalid native Word document.');
  // Early v1 archives omitted w:next from compiled styles and treated literal XML line ends
  // as paragraph separators. Recover their semantics from the verified preservation bytes.
  const legacyStyleNext = restored.compiled.some(({ artifact }) => {
    const styles = artifact.document.styles;
    return styles.partName !== undefined && styles.styles.some(style => !Object.hasOwn(style, 'next'));
  });
  const legacyWhitespace = (blocks: readonly WordContentBlock[]): boolean => blocks.some(block =>
    block.kind === 'table' ? block.rows.some(row => row.some(cell => legacyWhitespace(cell.blocks)))
      : block.kind === 'paragraph' && block.runs.some(run => /[\r\n]/.test(run.text)));
  if (legacyStyleNext || restored.compiled.some(source => legacyWhitespace(source.original))) {
    const reopened = openWordArtifact(restored.artifact.bytes(), restored.artifact.document.openOptions);
    const partName = restored.artifact.document.part.name.value;
    return partName === reopened.document.part.name.value ? reopened : wordStoryArtifact(reopened, partName);
  }
  for (const source of restored.compiled) {
    if (source.artifact === restored.artifact) continue;
    bindWordStoryArtifact(restored.artifact, source.artifact.document.part.name.value, source.artifact);
  }
  return restored.artifact;
}

export function isWordNativeArchive(bytes: Uint8Array): boolean {
  return bytes.length >= magic.length && magic.every((value, index) => bytes[index] === value);
}

/** Portable transport for a native archive. SQLite hosts can retain model/resources as separate blobs. */
export function encodeWordNativeArchive(archive: WordNativeArchive): Uint8Array {
  const header = encoder.encode(JSON.stringify({ version: archive.version, model: archive.model.byteLength,
    modelCrc32: crc32(archive.model), resources: archive.resources.map(bytes => bytes.byteLength) }));
  const length = 16 + header.byteLength + archive.model.byteLength + archive.resources.reduce((total, bytes) => total + bytes.byteLength, 0);
  const output = new Uint8Array(length);
  output.set(magic);
  new DataView(output.buffer).setFloat64(8, header.byteLength, true);
  let offset = 16;
  for (const bytes of [header, archive.model, ...archive.resources]) {
    output.set(bytes, offset);
    offset += bytes.byteLength;
  }
  return output;
}

const length = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const headerSchema = z.object({ version: z.literal(1), model: length, modelCrc32: z.number().int().nonnegative(), resources: z.array(length) }).strict();
export function decodeWordNativeArchive(bytes: Uint8Array): WordNativeArchive {
  if (!isWordNativeArchive(bytes) || bytes.byteLength < 16) throw new TypeError('Invalid native Word archive.');
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(8, true);
  if (!Number.isSafeInteger(headerLength) || headerLength < 0 || headerLength > bytes.byteLength - 16)
    throw new TypeError('Invalid native Word header length.');
  const header = headerSchema.parse(JSON.parse(decoder.decode(bytes.subarray(16, 16 + headerLength))));
  let offset = 16 + headerLength;
  const take = (length: number) => {
    if (length > bytes.byteLength - offset) throw new TypeError('Truncated native Word resource.');
    const resource = bytes.subarray(offset, offset + length);
    offset += length;
    return resource;
  };
  const model = take(header.model), resources = header.resources.map(take);
  if (offset !== bytes.byteLength || crc32(model) !== header.modelCrc32) throw new TypeError('Invalid native Word model integrity.');
  return { version: 1, model, resources };
}
