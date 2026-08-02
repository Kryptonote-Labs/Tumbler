import { deflateSync } from "fflate";
import { crc32 } from "./crc32.ts";
import type { ZipArchive, ZipEntry } from "./archive.ts";

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_ENTRY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const UTF8_NAME_FLAG = 1 << 11;
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;

export type ZipWriterErrorCode =
  | "archive_too_large"
  | "entry_too_large"
  | "unknown_entry";

export class ZipWriterError extends Error {
  readonly code: ZipWriterErrorCode;
  readonly entryName: string | undefined;

  constructor(
    code: ZipWriterErrorCode,
    message: string,
    options: { entryName?: string } = {},
  ) {
    super(message);
    this.name = "ZipWriterError";
    this.code = code;
    this.entryName = options.entryName;
  }
}

interface WrittenEntry {
  readonly source: ZipEntry;
  readonly nameBytes: Uint8Array;
  readonly flags: number;
  readonly compressed: Uint8Array;
  readonly uncompressedSize: number;
  readonly checksum: number;
  readonly localOffset: number;
}

/**
 * Rebuilds a classic ZIP while copying the exact compressed payload of every
 * untouched entry. An empty replacement map returns the original bytes.
 */
export function writeZipArchive(
  archive: ZipArchive,
  replacements: ReadonlyMap<string, Uint8Array>,
): Uint8Array {
  if (replacements.size === 0) {
    return archive.originalBytes();
  }
  for (const name of replacements.keys()) {
    if (archive.get(name) === undefined) {
      throw new ZipWriterError(
        "unknown_entry",
        `Cannot replace unknown ZIP entry ${JSON.stringify(name)}.`,
        { entryName: name },
      );
    }
  }
  if (archive.entries.length > UINT16_MAX) {
    throw new ZipWriterError("archive_too_large", "The output requires ZIP64 entry counts.");
  }

  const encoder = new TextEncoder();
  const localRecords: Uint8Array[] = [];
  const written: WrittenEntry[] = [];
  let localOffset = 0;

  for (const entry of archive.entries) {
    const replacement = replacements.get(entry.name);
    const nameBytes = encoder.encode(entry.name);
    if (nameBytes.byteLength > UINT16_MAX) {
      throw new ZipWriterError(
        "entry_too_large",
        `ZIP entry name ${JSON.stringify(entry.name)} is too long.`,
        { entryName: entry.name },
      );
    }
    const uncompressedSize = replacement?.byteLength ?? entry.uncompressedSize;
    const compressed = replacement === undefined
      ? archive.compressedBytes(entry)
      : entry.compressionMethod === 0
        ? replacement
        : deflateSync(replacement, { level: 6 });
    const checksum = replacement === undefined ? entry.crc32 : crc32(replacement);
    requireClassicZipSize(entry.name, compressed.byteLength, uncompressedSize);

    const flags = UTF8_NAME_FLAG;
    const localHeader = new Uint8Array(30 + nameBytes.byteLength);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, LOCAL_FILE_HEADER_SIGNATURE, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, flags, true);
    view.setUint16(8, entry.compressionMethod, true);
    view.setUint32(14, checksum, true);
    view.setUint32(18, compressed.byteLength, true);
    view.setUint32(22, uncompressedSize, true);
    view.setUint16(26, nameBytes.byteLength, true);
    localHeader.set(nameBytes, 30);

    localRecords.push(localHeader, compressed);
    written.push({
      source: entry,
      nameBytes,
      flags,
      compressed,
      uncompressedSize,
      checksum,
      localOffset,
    });
    localOffset += localHeader.byteLength + compressed.byteLength;
    if (localOffset > UINT32_MAX) {
      throw new ZipWriterError("archive_too_large", "The output requires ZIP64 offsets.");
    }
  }

  const centralRecords = written.map((entry) => buildCentralRecord(entry));
  const centralSize = centralRecords.reduce((total, record) => total + record.byteLength, 0);
  if (centralSize > UINT32_MAX) {
    throw new ZipWriterError("archive_too_large", "The output requires a ZIP64 central directory.");
  }
  const comment = encoder.encode(archive.comment);
  if (comment.byteLength > UINT16_MAX) {
    throw new ZipWriterError("archive_too_large", "The ZIP archive comment is too long.");
  }
  const end = new Uint8Array(22 + comment.byteLength);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);
  endView.setUint16(8, written.length, true);
  endView.setUint16(10, written.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, comment.byteLength, true);
  end.set(comment, 22);

  return concatenate([...localRecords, ...centralRecords, end]);
}

function buildCentralRecord(entry: WrittenEntry): Uint8Array {
  const record = new Uint8Array(46 + entry.nameBytes.byteLength);
  const view = new DataView(record.buffer);
  view.setUint32(0, CENTRAL_DIRECTORY_ENTRY_SIGNATURE, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, entry.flags, true);
  view.setUint16(10, entry.source.compressionMethod, true);
  view.setUint32(16, entry.checksum, true);
  view.setUint32(20, entry.compressed.byteLength, true);
  view.setUint32(24, entry.uncompressedSize, true);
  view.setUint16(28, entry.nameBytes.byteLength, true);
  view.setUint32(42, entry.localOffset, true);
  record.set(entry.nameBytes, 46);
  return record;
}

function requireClassicZipSize(
  name: string,
  compressedSize: number,
  uncompressedSize: number,
): void {
  if (compressedSize > UINT32_MAX || uncompressedSize > UINT32_MAX) {
    throw new ZipWriterError(
      "entry_too_large",
      `ZIP entry ${JSON.stringify(name)} requires ZIP64 sizes.`,
      { entryName: name },
    );
  }
}

function concatenate(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
