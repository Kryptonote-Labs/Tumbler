import { ContentTypes, OpcPackage, PartName, ZipArchive, nativeCodec, writeNativeGraph, readNativeGraph } from '@tumblerjs/opc';
import { SpreadsheetArtifact, type OpenSpreadsheetArtifactOptions } from './artifact.ts';
import { openSpreadsheet } from './workbook.ts';

const codecs = [
  nativeCodec('part-name', (v): v is PartName => v instanceof PartName, v => v.value, v => PartName.parse(v)),
  nativeCodec('zip-members', (v): v is ZipArchive => v instanceof ZipArchive, v => v.snapshot(), v => ZipArchive.fromSnapshot(v)),
  nativeCodec('content-types', (v): v is ContentTypes => v instanceof ContentTypes, v => ({ defaults: v.defaults, overrides: v.overrides }), v => new ContentTypes(v.defaults, v.overrides)),
  nativeCodec('opc-parts', (v): v is OpcPackage => v instanceof OpcPackage, v => ({ archive: v.archive, types: v.contentTypes, parts: v.parts }), v => new OpcPackage(v.archive, v.types, v.parts)),
];
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const magic = encoder.encode('TMBLSHT1');
export interface NativeSpreadsheetArchive {
  readonly version: 1;
  readonly manifest: Uint8Array;
  readonly resources: ReadonlyMap<string, Uint8Array>;
}

/** Native archives store member resources separately, preserving untouched ZIP members exactly. */
export function createSpreadsheetNativeArchive(artifact: SpreadsheetArtifact): NativeSpreadsheetArchive {
  const { graph, resources } = writeNativeGraph(artifact.workbook.package, codecs);
  return {
    version: 1,
    manifest: encoder.encode(JSON.stringify(graph)),
    resources: new Map(resources.map((data, index) => [String(index), data])),
  };
}

export function openSpreadsheetNativeArchive(archive: NativeSpreadsheetArchive, options: OpenSpreadsheetArtifactOptions = {}): SpreadsheetArtifact {
  if (archive.version !== 1) throw new TypeError('Unsupported native spreadsheet version.');
  const resources: Uint8Array[] = [];
  for (let index = 0; index < archive.resources.size; index++) {
    const data = archive.resources.get(String(index));
    if (!data) throw new TypeError('Missing native spreadsheet resource.');
    resources.push(data);
  }
  const pkg = readNativeGraph(JSON.parse(decoder.decode(archive.manifest)), resources, codecs);
  if (!(pkg instanceof OpcPackage)) throw new TypeError('Invalid native spreadsheet package.');
  const workbook = openSpreadsheet(pkg);
  const active = (options.sheet === undefined ? undefined : workbook.sheet(options.sheet)) ?? workbook.sheets.find(sheet => sheet.state === 'visible') ?? workbook.sheets[0];
  if (!active) throw new TypeError('The workbook contains no worksheets.');
  return new SpreadsheetArtifact(workbook, active);
}

export function isSpreadsheetNativeArchive(bytes: Uint8Array): boolean {
  return bytes.length >= magic.length && magic.every((value, index) => bytes[index] === value);
}

/** Framed native transport has no ZIP compression or source-package reconstruction. */
export function encodeSpreadsheetNativeArchive(archive: NativeSpreadsheetArchive): Uint8Array {
  const entries = [...archive.resources];
  const header = encoder.encode(JSON.stringify({ version: 1, manifest: archive.manifest.length, resources: entries.map(([id, data]) => [id, data.length]) }));
  const output = new Uint8Array(12 + header.length + archive.manifest.length + entries.reduce((size, [, data]) => size + data.length, 0));
  output.set(magic);
  new DataView(output.buffer).setUint32(8, header.length, true);
  output.set(header, 12);
  let offset = 12 + header.length;
  output.set(archive.manifest, offset);
  offset += archive.manifest.length;
  for (const [, data] of entries) { output.set(data, offset); offset += data.length; }
  return output;
}

export function decodeSpreadsheetNativeArchive(bytes: Uint8Array): NativeSpreadsheetArchive {
  if (!isSpreadsheetNativeArchive(bytes) || bytes.length < 12) throw new TypeError('Invalid native spreadsheet header.');
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true);
  let offset = 12 + headerLength;
  if (offset > bytes.length) throw new TypeError('Truncated native spreadsheet header.');
  const header: unknown = JSON.parse(decoder.decode(bytes.subarray(12, offset)));
  if (!header || typeof header !== 'object' || !('version' in header) || header.version !== 1 || !('manifest' in header) || !('resources' in header) || typeof header.manifest !== 'number' || !Array.isArray(header.resources)) throw new TypeError('Invalid native spreadsheet manifest.');
  const read = (length: number) => {
    if (!Number.isSafeInteger(length) || length < 0 || offset + length > bytes.length) throw new TypeError('Truncated native spreadsheet resource.');
    const result = bytes.slice(offset, offset + length); offset += length; return result;
  };
  const manifest = read(header.manifest);
  const resources = new Map<string, Uint8Array>();
  for (const item of header.resources) {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || typeof item[1] !== 'number' || resources.has(item[0])) throw new TypeError('Invalid native spreadsheet resource.');
    resources.set(item[0], read(item[1]));
  }
  if (offset !== bytes.length) throw new TypeError('Trailing native spreadsheet content.');
  return { version: 1, manifest, resources };
}
