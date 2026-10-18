/** Portable RGBA PNG encoding with lossless stored DEFLATE blocks.
 * No browser canvas, platform codec, or image resampling is involved.
 */
export function encodeInkPng(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || rgba.length !== width * height * 4) throw new RangeError('Invalid PNG dimensions.');
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let row = 0; row < height; row++) raw.set(rgba.subarray(row * width * 4, (row + 1) * width * 4), row * (width * 4 + 1) + 1);
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let start = 0; start < raw.length; start += 65535) {
    const length = Math.min(65535, raw.length - start), block = new Uint8Array(length + 5);
    block[0] = start + length === raw.length ? 1 : 0;
    new DataView(block.buffer).setUint16(1, length, true);
    new DataView(block.buffer).setUint16(3, length ^ 65535, true);
    block.set(raw.subarray(start, start + length), 5); blocks.push(block);
  }
  let a = 1, b = 0;
  for (const value of raw) { a = (a + value) % 65521; b = (b + a) % 65521; }
  blocks.push(uint32(((b << 16) | a) >>> 0));
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6;
  return join([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', join(blocks)), chunk('IEND', new Uint8Array())]);
}
function uint32(value: number) { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value); return bytes; }
function join(parts: readonly Uint8Array[]) { const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0)); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; } return bytes; }
function chunk(type: string, data: Uint8Array) {
  const payload = join([new TextEncoder().encode(type), data]);
  let crc = 0xffffffff;
  for (const value of payload) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return join([uint32(data.length), payload, uint32((crc ^ 0xffffffff) >>> 0)]);
}
