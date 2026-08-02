export interface TestZipEntry {
  readonly name: string;
  readonly data?: Uint8Array;
  readonly flags?: number;
  readonly compressionMethod?: number;
  readonly declaredCompressedSize?: number;
  readonly declaredUncompressedSize?: number;
}

export interface TestZipOptions {
  readonly comment?: string;
  readonly totalEntriesOverride?: number;
}

export function buildStoredZip(
  entries: readonly TestZipEntry[],
  options: TestZipOptions = {},
): Uint8Array {
  const encoder = new TextEncoder();
  const localRecords: Uint8Array[] = [];
  const centralRecords: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.data ?? new Uint8Array();
    const flags = (entry.flags ?? 0) | (name.some((byte) => byte > 0x7f) ? 1 << 11 : 0);
    const compressionMethod = entry.compressionMethod ?? 0;
    const compressedSize = entry.declaredCompressedSize ?? data.byteLength;
    const uncompressedSize = entry.declaredUncompressedSize ?? data.byteLength;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.byteLength + data.byteLength);
    const localView = new DataView(local.buffer);

    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, flags);
    writeUint16(localView, 8, compressionMethod);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, compressedSize);
    writeUint32(localView, 22, uncompressedSize);
    writeUint16(localView, 26, name.byteLength);
    local.set(name, 30);
    local.set(data, 30 + name.byteLength);
    localRecords.push(local);

    const central = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(central.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, flags);
    writeUint16(centralView, 10, compressionMethod);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, compressedSize);
    writeUint32(centralView, 24, uncompressedSize);
    writeUint16(centralView, 28, name.byteLength);
    writeUint32(centralView, 42, localOffset);
    central.set(name, 46);
    centralRecords.push(central);
    localOffset += local.byteLength;
  }

  const centralDirectory = concatenate(centralRecords);
  const comment = encoder.encode(options.comment ?? "");
  const eocd = new Uint8Array(22 + comment.byteLength);
  const eocdView = new DataView(eocd.buffer);
  const declaredEntries = options.totalEntriesOverride ?? entries.length;
  writeUint32(eocdView, 0, 0x06054b50);
  writeUint16(eocdView, 8, declaredEntries);
  writeUint16(eocdView, 10, declaredEntries);
  writeUint32(eocdView, 12, centralDirectory.byteLength);
  writeUint32(eocdView, 16, localOffset);
  writeUint16(eocdView, 20, comment.byteLength);
  eocd.set(comment, 22);

  return concatenate([...localRecords, centralDirectory, eocd]);
}

function concatenate(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}
