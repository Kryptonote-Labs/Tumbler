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
  | "duplicate_entry"
  | "entry_too_large"
  | "invalid_change"
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
  readonly compressionMethod: 0 | 8;
  readonly nameBytes: Uint8Array;
  readonly flags: number;
  readonly compressed: Uint8Array;
  readonly uncompressedSize: number;
  readonly checksum: number;
  readonly localOffset: number;
}

export interface ZipEntryAddition {
  readonly name: string;
  readonly data: Uint8Array;
  readonly compressionMethod?: 0 | 8;
}

export interface ZipArchiveChanges {
  readonly replacements?: ReadonlyMap<string, Uint8Array>;
  readonly additions?: readonly ZipEntryAddition[];
  readonly removals?: ReadonlySet<string>;
}

/**
 * Rebuilds a classic ZIP while copying the exact compressed payload of every
 * untouched entry. An empty replacement map returns the original bytes.
 */
export function writeZipArchive(
  archive: ZipArchive,
  replacements: ReadonlyMap<string, Uint8Array>,
): Uint8Array {
  return writeZipArchiveChanges(archive, { replacements });
}

export function writeZipArchiveChanges(
  archive: ZipArchive,
  changes: ZipArchiveChanges,
): Uint8Array {
  const replacements = changes.replacements ?? new Map();
  const additions = changes.additions ?? [];
  const removals = changes.removals ?? new Set();
  if (replacements.size === 0 && additions.length === 0 && removals.size === 0) {
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
  for (const name of removals) {
    if (archive.get(name) === undefined) {
      throw new ZipWriterError(
        "unknown_entry",
        `Cannot remove unknown ZIP entry ${JSON.stringify(name)}.`,
        { entryName: name },
      );
    }
    if (replacements.has(name)) {
      throw new ZipWriterError(
        "invalid_change",
        `ZIP entry ${JSON.stringify(name)} cannot be replaced and removed together.`,
        { entryName: name },
      );
    }
  }
  const additionNames = new Set<string>();
  for (const addition of additions) {
    if (archive.get(addition.name) !== undefined || additionNames.has(addition.name)) {
      throw new ZipWriterError(
        "duplicate_entry",
        `Cannot add duplicate ZIP entry ${JSON.stringify(addition.name)}.`,
        { entryName: addition.name },
      );
    }
    additionNames.add(addition.name);
  }
  const outputEntryCount = archive.entries.length - removals.size + additions.length;
  if (outputEntryCount > UINT16_MAX) {
    throw new ZipWriterError("archive_too_large", "The output requires ZIP64 entry counts.");
  }

  const encoder = new TextEncoder();
  const localRecords: Uint8Array[] = [];
  const written: WrittenEntry[] = [];
  let localOffset = 0;

  for (const entry of archive.entries) {
    if (removals.has(entry.name)) {
      continue;
    }
    const replacement = replacements.get(entry.name);
    appendEntry({
      name: entry.name,
      compressionMethod: entry.compressionMethod,
      compressed: replacement === undefined
        ? archive.compressedBytes(entry)
        : entry.compressionMethod === 0
          ? replacement
          : deflateSync(replacement, { level: 6 }),
      uncompressedSize: replacement?.byteLength ?? entry.uncompressedSize,
      checksum: replacement === undefined ? entry.crc32 : crc32(replacement),
    });
  }

  for (const addition of additions) {
    const compressionMethod = addition.compressionMethod ?? 8;
    appendEntry({
      name: addition.name,
      compressionMethod,
      compressed: compressionMethod === 0
        ? addition.data
        : deflateSync(addition.data, { level: 6 }),
      uncompressedSize: addition.data.byteLength,
      checksum: crc32(addition.data),
    });
  }

  function appendEntry(input: {
    readonly name: string;
    readonly compressionMethod: 0 | 8;
    readonly compressed: Uint8Array;
    readonly uncompressedSize: number;
    readonly checksum: number;
  }): void {
    const nameBytes = encoder.encode(input.name);
    if (nameBytes.byteLength > UINT16_MAX) {
      throw new ZipWriterError(
        "entry_too_large",
        `ZIP entry name ${JSON.stringify(input.name)} is too long.`,
        { entryName: input.name },
      );
    }
    requireClassicZipSize(input.name, input.compressed.byteLength, input.uncompressedSize);

    const flags = UTF8_NAME_FLAG;
    const localHeader = new Uint8Array(30 + nameBytes.byteLength);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, LOCAL_FILE_HEADER_SIGNATURE, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, flags, true);
    view.setUint16(8, input.compressionMethod, true);
    view.setUint32(14, input.checksum, true);
    view.setUint32(18, input.compressed.byteLength, true);
    view.setUint32(22, input.uncompressedSize, true);
    view.setUint16(26, nameBytes.byteLength, true);
    localHeader.set(nameBytes, 30);

    localRecords.push(localHeader, input.compressed);
    written.push({
      compressionMethod: input.compressionMethod,
      nameBytes,
      flags,
      compressed: input.compressed,
      uncompressedSize: input.uncompressedSize,
      checksum: input.checksum,
      localOffset,
    });
    localOffset += localHeader.byteLength + input.compressed.byteLength;
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
  view.setUint16(10, entry.compressionMethod, true);
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
