import { expect, test } from 'bun:test';
import fc from 'fast-check';
import { crc32 } from '../src/zip/crc32.ts';

// Independent bit-at-a-time reference, without the implementation's lookup table.
function reference(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

test('CRC-32 matches the reference for binary data and offset views', () => {
  fc.assert(fc.property(fc.uint8Array({ maxLength: 8192 }), bytes => {
    const padded = new Uint8Array(bytes.length + 11).fill(0xff);
    padded.set(bytes, 3);
    expect(crc32(padded.subarray(3, 3 + bytes.length))).toBe(reference(bytes));
  }), { numRuns: 200 });
  expect(crc32(new Uint8Array())).toBe(0);
  expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
});
