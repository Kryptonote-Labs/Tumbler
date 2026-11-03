import { invalid } from "./objects.ts";

function readIndex(bytes: Uint8Array, at: number) {
  if (at + 2 > bytes.length) return invalid("Truncated CFF index.");
  const count = bytes[at]! * 256 + bytes[at + 1]!;
  if (!count) return { end: at + 2, entries: [] as Uint8Array[] };
  const width = bytes[at + 2]!;
  if (width < 1 || width > 4) return invalid("Invalid CFF index offset width.");
  let position = at + 3;
  const offsets: number[] = [];
  for (let i = 0; i <= count; i++) {
    let value = 0;
    for (let j = 0; j < width; j++) {
      if (position >= bytes.length) return invalid("Truncated CFF index offsets.");
      value = value * 256 + bytes[position++]!;
    }
    offsets.push(value);
  }
  if (
    offsets[0] !== 1 ||
    offsets.some((value, i) => value < 1 || (i > 0 && value < offsets[i - 1]!)) ||
    position + offsets[count]! - 1 > bytes.length
  )
    return invalid("Invalid CFF index bounds.");
  return {
    end: position + offsets[count]! - 1,
    entries: offsets
      .slice(0, -1)
      .map((value, i) => bytes.subarray(position + value - 1, position + offsets[i + 1]! - 1)),
  };
}
function charStringsOffset(bytes: Uint8Array) {
  const names = readIndex(bytes, bytes[2]!),
    dictionaries = readIndex(bytes, names.end);
  if (dictionaries.entries.length !== 1)
    return invalid("PDF embedded CFF must contain one top dictionary.");
  const data = dictionaries.entries[0]!,
    args: number[] = [];
  for (let at = 0; at < data.length;) {
    const byte = data[at++]!;
    if (byte >= 32 && byte <= 246) args.push(byte - 139);
    else if (byte >= 247 && byte <= 250) args.push((byte - 247) * 256 + data[at++]! + 108);
    else if (byte >= 251 && byte <= 254) args.push(-(byte - 251) * 256 - data[at++]! - 108);
    else if (byte === 28) {
      args.push(new DataView(data.buffer, data.byteOffset + at, 2).getInt16(0));
      at += 2;
    } else if (byte === 29) {
      args.push(new DataView(data.buffer, data.byteOffset + at, 4).getInt32(0));
      at += 4;
    } else if (byte === 30) {
      while (at < data.length) {
        const value = data[at++]!;
        if ((value & 15) === 15 || value >> 4 === 15) break;
      }
      args.push(0);
    } else {
      if (byte === 17) {
        if (args.length !== 1) return invalid("Invalid CFF CharStrings offset.");
        return args[0]!;
      }
      if (byte === 12) at++;
      args.length = 0;
    }
  }
  return invalid("CFF has no CharStrings index.");
}

/** Wrap a raw PDF CFF program in a minimal OpenType directory for the font outline decoder.
 * The original CFF table is unchanged; PDF widths/encodings remain authoritative in PdfFont. */
export function cffOpenType(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 1 || bytes[2]! < 4) return invalid("Unsupported or malformed CFF header.");
  const charStrings = readIndex(bytes, charStringsOffset(bytes)),
    count = charStrings.entries.length;
  if (!count) return invalid("CFF font contains no glyphs.");
  const head = new Uint8Array(54),
    hhea = new Uint8Array(36),
    maxp = new Uint8Array(6),
    hmtx = new Uint8Array(4 + (count - 1) * 2),
    post = new Uint8Array(32);
  const hv = new DataView(head.buffer);
  hv.setUint32(0, 0x10000);
  hv.setUint32(12, 0x5f0f3cf5);
  hv.setUint16(18, 1000);
  hv.setInt16(40, 1000);
  hv.setInt16(42, 1000);
  new DataView(hhea.buffer).setUint32(0, 0x10000);
  new DataView(hhea.buffer).setUint16(34, 1);
  new DataView(maxp.buffer).setUint32(0, 0x5000);
  new DataView(maxp.buffer).setUint16(4, count);
  new DataView(hmtx.buffer).setUint16(0, 1000);
  new DataView(post.buffer).setUint32(0, 0x30000);
  const tables = new Map([
    ["CFF ", bytes],
    ["cmap", Uint8Array.of(0, 0, 0, 0)],
    ["head", head],
    ["hhea", hhea],
    ["hmtx", hmtx],
    ["maxp", maxp],
    ["name", Uint8Array.of(0, 0, 0, 0, 0, 6)],
    ["post", post],
  ]);
  const headerLength = 12 + tables.size * 16,
    result = new Uint8Array(
      headerLength +
        [...tables.values()].reduce((sum, table) => sum + Math.ceil(table.length / 4) * 4, 0),
    );
  const view = new DataView(result.buffer);
  result.set(new TextEncoder().encode("OTTO"));
  view.setUint16(4, tables.size);
  view.setUint16(6, 128);
  view.setUint16(8, 3);
  view.setUint16(10, 0);
  let at = headerLength,
    row = 12,
    total = 0;
  for (const [tag, table] of tables) {
    result.set(new TextEncoder().encode(tag), row);
    result.set(table, at);
    let checksum = 0;
    for (let i = 0; i < Math.ceil(table.length / 4) * 4; i += 4)
      checksum = (checksum + view.getUint32(at + i)) >>> 0;
    view.setUint32(row + 4, checksum);
    view.setUint32(row + 8, at);
    view.setUint32(row + 12, table.length);
    if (tag === "head") total = at;
    at += Math.ceil(table.length / 4) * 4;
    row += 16;
  }
  let checksum = 0;
  for (let i = 0; i < result.length; i += 4) checksum = (checksum + view.getUint32(i)) >>> 0;
  view.setUint32(total + 8, (0xb1b0afba - checksum) >>> 0);
  return result;
}
