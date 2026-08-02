import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  ContentTypesError,
  openZipArchive,
  parseContentTypes,
  ZipArchiveError,
} from "../src/index.ts";
import { buildDeflatedZip, buildStoredZip } from "./zip-builder.ts";

describe("hostile input remains bounded and typed", () => {
  test("rejects arbitrary byte strings without leaking parser exceptions", () => {
    fc.assert(fc.property(
      fc.uint8Array({ maxLength: 4_096 }),
      (bytes) => {
        try {
          const archive = openZipArchive(bytes, {
            limits: {
              maxEntries: 32,
              maxEntryCompressedBytes: 64 * 1024,
              maxEntryUncompressedBytes: 64 * 1024,
              maxTotalCompressedBytes: 128 * 1024,
              maxTotalUncompressedBytes: 128 * 1024,
            },
          });
          for (const entry of archive.entries) {
            archive.read(entry);
          }
        } catch (error) {
          expect(error).toBeInstanceOf(ZipArchiveError);
        }
      },
    ), { numRuns: 1_000 });
  });

  test("handles every single-byte mutation of a valid compressed archive", () => {
    const source = buildDeflatedZip([
      { name: "one.xml", data: new TextEncoder().encode("<one>content</one>") },
      { name: "two.bin", data: Uint8Array.from({ length: 256 }, (_, index) => index) },
    ]);

    for (let offset = 0; offset < source.byteLength; offset += 1) {
      const mutated = source.slice();
      mutated[offset] = (mutated[offset] ?? 0) ^ 0xff;
      try {
        const archive = openZipArchive(mutated);
        for (const entry of archive.entries) {
          archive.read(entry);
        }
      } catch (error) {
        expect(error).toBeInstanceOf(ZipArchiveError);
      }
    }
  });

  test("turns generated infrastructure XML damage into content-type diagnostics", () => {
    fc.assert(fc.property(
      fc.uint8Array({ maxLength: 2_048 }),
      (xml) => {
        const archive = openZipArchive(buildStoredZip([
          { name: "[Content_Types].xml", data: xml },
        ]));
        try {
          parseContentTypes(archive);
        } catch (error) {
          expect(error).toBeInstanceOf(ContentTypesError);
        }
      },
    ), { numRuns: 500 });
  });
});
