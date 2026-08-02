const CRC32_TABLE = buildCrc32Table();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    const tableValue = CRC32_TABLE[(crc ^ byte) & 0xff];
    if (tableValue === undefined) {
      throw new Error("CRC-32 lookup index is out of bounds.");
    }
    crc = tableValue ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    table[index] = value >>> 0;
  }
  return table;
}
