import { inflateSync } from "fflate";
import { crc32 } from "./crc32.ts";

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const END_OF_CENTRAL_DIRECTORY_SIZE = 22;
const CENTRAL_DIRECTORY_ENTRY_SIZE = 46;
const LOCAL_FILE_HEADER_SIZE = 30;
const MAX_ZIP_COMMENT_SIZE = 65_535;
const UTF8_NAME_FLAG = 1 << 11;
const ENCRYPTED_FLAG = 1;

export type ZipArchiveErrorCode =
  | "archive_too_small"
  | "central_directory_bounds"
  | "duplicate_entry"
  | "decompression_failed"
  | "encrypted_entry"
  | "entry_crc_mismatch"
  | "entry_compression_ratio"
  | "entry_count_limit"
  | "entry_length_mismatch"
  | "entry_size_limit"
  | "invalid_central_directory"
  | "invalid_entry_name"
  | "invalid_local_header"
  | "invalid_name_encoding"
  | "multidisk_unsupported"
  | "overlapping_entries"
  | "total_size_limit"
  | "trailing_data"
  | "unsupported_compression"
  | "zip64_unsupported";

export class ZipArchiveError extends Error {
  readonly code: ZipArchiveErrorCode;
  readonly entryName: string | undefined;

  constructor(
    code: ZipArchiveErrorCode,
    message: string,
    options: { entryName?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ZipArchiveError";
    this.code = code;
    this.entryName = options.entryName;
  }
}

export interface ZipArchiveLimits {
  readonly maxEntries: number;
  readonly maxEntryCompressedBytes: number;
  readonly maxEntryUncompressedBytes: number;
  readonly maxTotalCompressedBytes: number;
  readonly maxTotalUncompressedBytes: number;
  readonly maxCompressionRatio: number;
}

export const DEFAULT_ZIP_LIMITS: ZipArchiveLimits = Object.freeze({
  maxEntries: 10_000,
  maxEntryCompressedBytes: 256 * 1024 * 1024,
  maxEntryUncompressedBytes: 256 * 1024 * 1024,
  maxTotalCompressedBytes: 512 * 1024 * 1024,
  maxTotalUncompressedBytes: 512 * 1024 * 1024,
  maxCompressionRatio: 1_000,
});

export interface OpenZipArchiveOptions {
  readonly limits?: Partial<ZipArchiveLimits>;
}

export interface ZipEntry {
  readonly name: string;
  readonly compressionMethod: 0 | 8;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly crc32: number;
  readonly flags: number;
  readonly localHeaderOffset: number;
  readonly compressedDataOffset: number;
}

export class ZipArchive {
  readonly entries: readonly ZipEntry[];
  readonly comment: string;
  readonly byteLength: number;
  readonly #source: Uint8Array;
  readonly #byName: ReadonlyMap<string, ZipEntry>;

  constructor(
    source: Uint8Array,
    entries: readonly ZipEntry[],
    comment: string,
  ) {
    this.#source = source;
    this.entries = Object.freeze([...entries]);
    this.comment = comment;
    this.byteLength = source.byteLength;
    this.#byName = new Map(entries.map((entry) => [entry.name, entry]));
  }

  get(name: string): ZipEntry | undefined {
    return this.#byName.get(name);
  }

  /** Returns the original archive bytes. Callers must treat them as immutable. */
  originalBytes(): Uint8Array {
    return this.#source;
  }

  /** Returns the exact compressed payload stored for an entry without inflating it. */
  compressedBytes(entry: ZipEntry): Uint8Array {
    this.#assertEntry(entry);
    return this.#source.subarray(
      entry.compressedDataOffset,
      entry.compressedDataOffset + entry.compressedSize,
    );
  }

  /** Inflates and verifies an entry using the sizes and CRC from its central record. */
  read(entry: ZipEntry): Uint8Array {
    this.#assertEntry(entry);
    const compressed = this.compressedBytes(entry);
    let output: Uint8Array;

    if (entry.compressionMethod === 0) {
      output = compressed.slice();
    } else {
      try {
        output = inflateSync(compressed, {
          out: new Uint8Array(entry.uncompressedSize),
        });
      } catch (cause) {
        throw new ZipArchiveError(
          "decompression_failed",
          `Entry ${JSON.stringify(entry.name)} could not be decompressed.`,
          { entryName: entry.name, cause },
        );
      }
    }

    if (output.byteLength !== entry.uncompressedSize) {
      throw new ZipArchiveError(
        "entry_length_mismatch",
        `Entry ${JSON.stringify(entry.name)} produced ${output.byteLength} bytes; ${entry.uncompressedSize} were declared.`,
        { entryName: entry.name },
      );
    }
    if (crc32(output) !== entry.crc32) {
      throw new ZipArchiveError(
        "entry_crc_mismatch",
        `Entry ${JSON.stringify(entry.name)} failed its CRC-32 check.`,
        { entryName: entry.name },
      );
    }
    return output;
  }

  #assertEntry(entry: ZipEntry): void {
    if (this.#byName.get(entry.name) !== entry) {
      throw new TypeError("The ZIP entry does not belong to this archive.");
    }
  }
}

export function openZipArchive(
  source: Uint8Array,
  options: OpenZipArchiveOptions = {},
): ZipArchive {
  if (source.byteLength < END_OF_CENTRAL_DIRECTORY_SIZE) {
    throw new ZipArchiveError(
      "archive_too_small",
      "The ZIP archive is too small to contain an end-of-central-directory record.",
    );
  }

  const limits = resolveLimits(options.limits);
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const diskNumber = readUint16(view, eocdOffset + 4);
  const centralDirectoryDisk = readUint16(view, eocdOffset + 6);
  const entriesOnDisk = readUint16(view, eocdOffset + 8);
  const totalEntries = readUint16(view, eocdOffset + 10);
  const centralDirectorySize = readUint32(view, eocdOffset + 12);
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16);
  const commentLength = readUint16(view, eocdOffset + 20);

  if (eocdOffset + END_OF_CENTRAL_DIRECTORY_SIZE + commentLength !== source.byteLength) {
    throw new ZipArchiveError(
      "trailing_data",
      "The ZIP archive contains data after its declared comment.",
    );
  }
  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw new ZipArchiveError(
      "multidisk_unsupported",
      "Multi-disk ZIP archives are not supported.",
    );
  }
  if (
    totalEntries === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new ZipArchiveError(
      "zip64_unsupported",
      "ZIP64 archives are not supported by the initial OPC reader.",
    );
  }
  if (totalEntries > limits.maxEntries) {
    throw new ZipArchiveError(
      "entry_count_limit",
      `The ZIP archive declares ${totalEntries} entries; the limit is ${limits.maxEntries}.`,
    );
  }
  if (
    centralDirectoryOffset + centralDirectorySize !== eocdOffset ||
    centralDirectoryOffset > eocdOffset
  ) {
    throw new ZipArchiveError(
      "central_directory_bounds",
      "The ZIP central directory does not end at the end-of-central-directory record.",
    );
  }

  const entries: ZipEntry[] = [];
  const localRanges: Array<{ readonly start: number; readonly end: number; readonly name: string }> = [];
  const names = new Set<string>();
  let cursor = centralDirectoryOffset;
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;

  for (let index = 0; index < totalEntries; index += 1) {
    ensureRange(source, cursor, CENTRAL_DIRECTORY_ENTRY_SIZE, "invalid_central_directory");
    if (readUint32(view, cursor) !== CENTRAL_DIRECTORY_ENTRY_SIGNATURE) {
      throw new ZipArchiveError(
        "invalid_central_directory",
        `Central-directory entry ${index} has an invalid signature.`,
      );
    }

    const flags = readUint16(view, cursor + 8);
    const compressionMethod = readUint16(view, cursor + 10);
    const crc32 = readUint32(view, cursor + 16);
    const compressedSize = readUint32(view, cursor + 20);
    const uncompressedSize = readUint32(view, cursor + 24);
    const nameLength = readUint16(view, cursor + 28);
    const extraLength = readUint16(view, cursor + 30);
    const entryCommentLength = readUint16(view, cursor + 32);
    const entryDisk = readUint16(view, cursor + 34);
    const localHeaderOffset = readUint32(view, cursor + 42);
    const recordLength =
      CENTRAL_DIRECTORY_ENTRY_SIZE + nameLength + extraLength + entryCommentLength;

    ensureRange(source, cursor, recordLength, "invalid_central_directory");
    const name = decodeName(
      source.subarray(
        cursor + CENTRAL_DIRECTORY_ENTRY_SIZE,
        cursor + CENTRAL_DIRECTORY_ENTRY_SIZE + nameLength,
      ),
      (flags & UTF8_NAME_FLAG) !== 0,
    );
    validateEntryName(name);

    if (names.has(name)) {
      throw new ZipArchiveError(
        "duplicate_entry",
        `The ZIP archive contains the entry ${JSON.stringify(name)} more than once.`,
        { entryName: name },
      );
    }
    names.add(name);

    if (entryDisk !== 0) {
      throw new ZipArchiveError(
        "multidisk_unsupported",
        `Entry ${JSON.stringify(name)} is stored on another disk.`,
        { entryName: name },
      );
    }
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new ZipArchiveError(
        "zip64_unsupported",
        `Entry ${JSON.stringify(name)} uses ZIP64 size fields.`,
        { entryName: name },
      );
    }
    if ((flags & ENCRYPTED_FLAG) !== 0) {
      throw new ZipArchiveError(
        "encrypted_entry",
        `Entry ${JSON.stringify(name)} is encrypted.`,
        { entryName: name },
      );
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new ZipArchiveError(
        "unsupported_compression",
        `Entry ${JSON.stringify(name)} uses unsupported compression method ${compressionMethod}.`,
        { entryName: name },
      );
    }

    enforceEntryLimits(
      name,
      compressedSize,
      uncompressedSize,
      limits,
    );
    totalCompressedBytes = checkedTotal(
      totalCompressedBytes,
      compressedSize,
      limits.maxTotalCompressedBytes,
      "compressed",
    );
    totalUncompressedBytes = checkedTotal(
      totalUncompressedBytes,
      uncompressedSize,
      limits.maxTotalUncompressedBytes,
      "uncompressed",
    );

    const compressedDataOffset = validateLocalHeader(
      source,
      view,
      name,
      flags,
      compressionMethod,
      localHeaderOffset,
      compressedSize,
      centralDirectoryOffset,
    );
    localRanges.push({
      start: localHeaderOffset,
      end: compressedDataOffset + compressedSize,
      name,
    });

    entries.push(
      Object.freeze({
        name,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        crc32,
        flags,
        localHeaderOffset,
        compressedDataOffset,
      }) as ZipEntry,
    );
    cursor += recordLength;
  }

  if (cursor !== eocdOffset) {
    throw new ZipArchiveError(
      "invalid_central_directory",
      "The declared entries do not consume the complete central directory.",
    );
  }
  validateNonOverlappingEntries(localRanges);

  const comment = decodeUtf8(
    source.subarray(
      eocdOffset + END_OF_CENTRAL_DIRECTORY_SIZE,
      source.byteLength,
    ),
    "The ZIP comment is not valid UTF-8.",
  );

  return new ZipArchive(source, entries, comment);
}

function resolveLimits(overrides: Partial<ZipArchiveLimits> | undefined): ZipArchiveLimits {
  const limits = { ...DEFAULT_ZIP_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`ZIP limit ${name} must be a non-negative finite number.`);
    }
  }
  return limits;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimumOffset = Math.max(
    0,
    view.byteLength - END_OF_CENTRAL_DIRECTORY_SIZE - MAX_ZIP_COMMENT_SIZE,
  );
  for (
    let offset = view.byteLength - END_OF_CENTRAL_DIRECTORY_SIZE;
    offset >= minimumOffset;
    offset -= 1
  ) {
    if (readUint32(view, offset) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      continue;
    }
    const commentLength = readUint16(view, offset + 20);
    if (offset + END_OF_CENTRAL_DIRECTORY_SIZE + commentLength === view.byteLength) {
      return offset;
    }
  }
  throw new ZipArchiveError(
    "invalid_central_directory",
    "The ZIP archive has no valid end-of-central-directory record.",
  );
}

function validateLocalHeader(
  source: Uint8Array,
  view: DataView,
  name: string,
  centralFlags: number,
  centralCompressionMethod: number,
  offset: number,
  compressedSize: number,
  centralDirectoryOffset: number,
): number {
  ensureRange(source, offset, LOCAL_FILE_HEADER_SIZE, "invalid_local_header", name);
  if (readUint32(view, offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new ZipArchiveError(
      "invalid_local_header",
      `Entry ${JSON.stringify(name)} has an invalid local-file-header signature.`,
      { entryName: name },
    );
  }

  const localFlags = readUint16(view, offset + 6);
  const localCompressionMethod = readUint16(view, offset + 8);
  const localNameLength = readUint16(view, offset + 26);
  const localExtraLength = readUint16(view, offset + 28);
  const dataOffset = offset + LOCAL_FILE_HEADER_SIZE + localNameLength + localExtraLength;

  ensureRange(
    source,
    offset,
    LOCAL_FILE_HEADER_SIZE + localNameLength + localExtraLength + compressedSize,
    "invalid_local_header",
    name,
  );
  if (dataOffset + compressedSize > centralDirectoryOffset) {
    throw new ZipArchiveError(
      "invalid_local_header",
      `Entry ${JSON.stringify(name)} overlaps the ZIP central directory.`,
      { entryName: name },
    );
  }
  const localName = decodeName(
    source.subarray(
      offset + LOCAL_FILE_HEADER_SIZE,
      offset + LOCAL_FILE_HEADER_SIZE + localNameLength,
    ),
    (localFlags & UTF8_NAME_FLAG) !== 0,
  );

  if (
    localName !== name ||
    localFlags !== centralFlags ||
    localCompressionMethod !== centralCompressionMethod
  ) {
    throw new ZipArchiveError(
      "invalid_local_header",
      `Entry ${JSON.stringify(name)} disagrees with its local file header.`,
      { entryName: name },
    );
  }
  return dataOffset;
}

function validateNonOverlappingEntries(
  ranges: Array<{ readonly start: number; readonly end: number; readonly name: string }>,
): void {
  ranges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1];
    const current = ranges[index];
    if (previous !== undefined && current !== undefined && current.start < previous.end) {
      throw new ZipArchiveError(
        "overlapping_entries",
        `ZIP entries ${JSON.stringify(previous.name)} and ${JSON.stringify(current.name)} overlap.`,
        { entryName: current.name },
      );
    }
  }
}

function validateEntryName(name: string): void {
  const segments = name.split("/");
  if (
    name.length === 0 ||
    name.startsWith("/") ||
    name.endsWith("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new ZipArchiveError(
      "invalid_entry_name",
      `ZIP entry name ${JSON.stringify(name)} is not a safe OPC item name.`,
      { entryName: name },
    );
  }
}

function enforceEntryLimits(
  name: string,
  compressedSize: number,
  uncompressedSize: number,
  limits: ZipArchiveLimits,
): void {
  if (
    compressedSize > limits.maxEntryCompressedBytes ||
    uncompressedSize > limits.maxEntryUncompressedBytes
  ) {
    throw new ZipArchiveError(
      "entry_size_limit",
      `Entry ${JSON.stringify(name)} exceeds its configured size limit.`,
      { entryName: name },
    );
  }

  const ratio = compressedSize === 0
    ? uncompressedSize === 0 ? 1 : Number.POSITIVE_INFINITY
    : uncompressedSize / compressedSize;
  if (ratio > limits.maxCompressionRatio) {
    throw new ZipArchiveError(
      "entry_compression_ratio",
      `Entry ${JSON.stringify(name)} declares compression ratio ${ratio}; the limit is ${limits.maxCompressionRatio}.`,
      { entryName: name },
    );
  }
}

function checkedTotal(
  current: number,
  addition: number,
  maximum: number,
  kind: "compressed" | "uncompressed",
): number {
  const next = current + addition;
  if (!Number.isSafeInteger(next) || next > maximum) {
    throw new ZipArchiveError(
      "total_size_limit",
      `The ZIP archive exceeds the total ${kind} size limit of ${maximum} bytes.`,
    );
  }
  return next;
}

function decodeName(bytes: Uint8Array, utf8: boolean): string {
  if (!utf8 && bytes.some((byte) => byte > 0x7f)) {
    throw new ZipArchiveError(
      "invalid_name_encoding",
      "Non-ASCII ZIP entry names must declare UTF-8 encoding.",
    );
  }
  return decodeUtf8(bytes, "A ZIP entry name is not valid UTF-8.");
}

function decodeUtf8(bytes: Uint8Array, message: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ZipArchiveError("invalid_name_encoding", message);
  }
}

function ensureRange(
  source: Uint8Array,
  offset: number,
  length: number,
  code: ZipArchiveErrorCode,
  entryName?: string,
): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset > source.byteLength - length
  ) {
    throw new ZipArchiveError(
      code,
      entryName === undefined
        ? "The ZIP archive contains an out-of-bounds record."
        : `Entry ${JSON.stringify(entryName)} contains an out-of-bounds record.`,
      { ...(entryName === undefined ? {} : { entryName }) },
    );
  }
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}
