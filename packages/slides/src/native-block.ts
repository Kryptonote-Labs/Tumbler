import { ThemeFontScheme, LosslessXmlDocument } from '@tumblerjs/ooxml';
import { deflateRaw, inflateRaw } from '@tumblerjs/opc/compression';
import {
  crc32,
  nativeCodec,
  readNativeGraph,
  writeNativeGraph,
  type NativeCodec,
} from '@tumblerjs/opc';

export const presentationBlockCodecs = [
  nativeCodec(
    'theme-fonts',
    (v): v is ThemeFontScheme => v instanceof ThemeFontScheme,
    (v) => ({ name: v.name, major: v.major, minor: v.minor }),
    (v) => new ThemeFontScheme(v.name, v.major, v.minor),
  ),
  nativeCodec(
    'xml-source',
    (v): v is LosslessXmlDocument => v instanceof LosslessXmlDocument,
    (v) => v.originalBytes(),
    (v) => new LosslessXmlDocument(v),
  ),
];
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true });
const magic = encoder.encode('TMBSLD01');

/** Individually compressed native blocks let one slide open without decoding the entire deck. */
export function encodePresentationBlock(
  value: unknown,
  codecs: readonly NativeCodec[] = [],
): Uint8Array {
  const { graph, resources } = writeNativeGraph(value, [...presentationBlockCodecs, ...codecs], {
    canonical: true,
  });
  const json = encoder.encode(JSON.stringify({ graph, lengths: resources.map((r) => r.length) }));
  const raw = new Uint8Array(8 + json.length + resources.reduce((n, r) => n + r.length, 0));
  new DataView(raw.buffer).setFloat64(0, json.length, true);
  raw.set(json, 8);
  let offset = 8 + json.length;
  for (const resource of resources) {
    raw.set(resource, offset);
    offset += resource.length;
  }
  const compressed = deflateRaw(raw);
  const result = new Uint8Array(20 + compressed.length);
  result.set(magic);
  const header = new DataView(result.buffer);
  header.setFloat64(8, raw.length, true);
  header.setUint32(16, crc32(raw), true);
  result.set(compressed, 20);
  return result;
}

export function isPresentationBlock(bytes: Uint8Array) {
  return bytes.length >= 20 && magic.every((v, i) => bytes[i] === v);
}

export function decodePresentationBlock(
  bytes: Uint8Array,
  codecs: readonly NativeCodec[] = [],
): unknown {
  if (!isPresentationBlock(bytes)) throw new TypeError('Invalid native presentation block.');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.length),
    length = header.getFloat64(8, true);
  if (!Number.isSafeInteger(length) || length < 8)
    throw new TypeError('Invalid native presentation block length.');
  const raw = inflateRaw(bytes.subarray(20), length);
  if (raw.length !== length || crc32(raw) !== header.getUint32(16, true))
    throw new TypeError('Native presentation block checksum mismatch.');
  const jsonLength = new DataView(raw.buffer, raw.byteOffset, raw.length).getFloat64(0, true);
  if (!Number.isSafeInteger(jsonLength) || jsonLength < 0 || jsonLength > raw.length - 8)
    throw new TypeError('Invalid native presentation model length.');
  const data: unknown = JSON.parse(decoder.decode(raw.subarray(8, 8 + jsonLength)));
  if (
    !data ||
    typeof data !== 'object' ||
    !('graph' in data) ||
    !('lengths' in data) ||
    !Array.isArray(data.lengths)
  )
    throw new TypeError('Invalid native presentation model.');
  let offset = 8 + jsonLength;
  const resources = data.lengths.map((length: unknown) => {
    if (
      typeof length !== 'number' ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > raw.length - offset
    )
      throw new TypeError('Missing native presentation resource.');
    const result = raw.subarray(offset, offset + length);
    offset += length;
    return result;
  });
  if (offset !== raw.length) throw new TypeError('Unexpected native presentation data.');
  return readNativeGraph(data.graph, resources, [...presentationBlockCodecs, ...codecs]);
}
