import { expect, test } from "bun:test";
import * as browser from "../src/zip/codec.ts";
import * as native from "../src/zip/codec-node.ts";

const fixtures = [
  new Uint8Array(),
  new TextEncoder().encode("<w:p>Word text: Ελληνικά, кириллица, 中文.</w:p>".repeat(200)),
  Uint8Array.from({ length: 65_537 }, (_, index) => (index * 31) & 0xff),
];

for (const bytes of fixtures) {
  test(`ZIP codecs read one another's raw deflate output for ${bytes.length} bytes`, () => {
    expect(native.inflateRaw(browser.deflateRaw(bytes), bytes.length)).toEqual(bytes);
    expect(browser.inflateRaw(native.deflateRaw(bytes), bytes.length)).toEqual(bytes);
  });
}

test("native ZIP inflation bounds output before allocating a larger entry", () => {
  const compressed = browser.deflateRaw(new Uint8Array(1_000_000));
  expect(() => native.inflateRaw(compressed, 10)).toThrow();
  expect(() => native.inflateRaw(compressed, 0)).toThrow();
});

test("native ZIP inflation rejects a truncated stream", () => {
  const compressed = browser.deflateRaw(fixtures[1]!);
  expect(() => native.inflateRaw(compressed.subarray(0, compressed.length - 2), fixtures[1]!.length)).toThrow();
});
