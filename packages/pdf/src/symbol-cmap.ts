/** Read a Windows Symbol format-4 cmap whose character codes address PDF glyphs directly. */
export function pdfSymbolCmap(program: Uint8Array) {
  const font = new DataView(program.buffer, program.byteOffset, program.byteLength);
  if (font.byteLength < 12 || font.getUint32(0) !== 0x00010000) return;
  for (let index = 0; index < font.getUint16(4); index++) {
    const entry = 12 + index * 16;
    if (entry + 16 > font.byteLength) return;
    if (font.getUint32(entry) !== 0x636d6170) continue;
    const offset = font.getUint32(entry + 8), length = font.getUint32(entry + 12);
    if (length < 4 || offset + length > font.byteLength) return;
    const cmap = new DataView(program.buffer, program.byteOffset + offset, length);
    for (let index = 0; index < cmap.getUint16(2); index++) {
      const record = 4 + index * 8;
      if (record + 8 > length) return;
      if (cmap.getUint16(record) !== 3 || cmap.getUint16(record + 2) !== 0) continue;
      const start = cmap.getUint32(record + 4);
      if (start + 16 > length || cmap.getUint16(start) !== 4) continue;
      const end = start + cmap.getUint16(start + 2), segCount = cmap.getUint16(start + 6) / 2;
      if (end > length || !Number.isInteger(segCount) || start + 16 + segCount * 8 > end) continue;
      const endCodes = start + 14, startCodes = endCodes + 2 * segCount + 2;
      const deltas = startCodes + 2 * segCount, ranges = deltas + 2 * segCount;
      function lookup(code: number) {
        for (let segment = 0; segment < segCount; segment++) {
          const shift = 2 * segment;
          if (code > cmap.getUint16(endCodes + shift)) continue;
          const first = cmap.getUint16(startCodes + shift);
          if (code < first) return 0;
          const delta = cmap.getInt16(deltas + shift), range = ranges + shift;
          const displacement = cmap.getUint16(range);
          if (!displacement) return (code + delta) & 0xffff;
          const address = range + displacement + (code - first) * 2;
          const glyph = address + 2 <= end ? cmap.getUint16(address) : 0;
          return glyph ? (glyph + delta) & 0xffff : 0;
        }
        return 0;
      }
      // Symbolic PDF fonts may store the byte code in one of four sfnt ranges.
      return (code: number) => lookup(code) || lookup(0xf000 | code) ||
        lookup(0xf100 | code) || lookup(0xf200 | code);
    }
  }
}
