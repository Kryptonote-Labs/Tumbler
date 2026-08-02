import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  openZipArchive,
  ZipArchiveError,
  type ZipArchiveErrorCode,
} from "../src/index.ts";
import { buildStoredZip } from "./zip-builder.ts";

const officePackageEntries = [
  ["docx", "word/document.xml"],
  ["xlsx", "xl/workbook.xml"],
  ["pptx", "ppt/presentation.xml"],
] as const;

describe("ZIP inventory", () => {
  test.each(officePackageEntries)(
    "inventories the infrastructure and main part of a %s package",
    (_format, mainPart) => {
      const bytes = buildStoredZip([
        { name: "[Content_Types].xml", data: utf8("types") },
        { name: "_rels/.rels", data: utf8("relationships") },
        { name: mainPart, data: utf8("main") },
      ]);

      const archive = openZipArchive(bytes);

      expect(archive.entries.map((entry) => entry.name)).toEqual([
        "[Content_Types].xml",
        "_rels/.rels",
        mainPart,
      ]);
      expect(archive.get(mainPart)?.uncompressedSize).toBe(4);
      expect(archive.originalBytes()).toBe(bytes);
      expect(archive.compressedBytes(archive.get(mainPart)!)).toEqual(utf8("main"));
    },
  );

  test("retains a UTF-8 archive comment", () => {
    const archive = openZipArchive(
      buildStoredZip([{ name: "part.xml" }], { comment: "Tumbler 🥃" }),
    );
    expect(archive.comment).toBe("Tumbler 🥃");
  });

  test("round-trips generated safe entry inventories", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            stem: fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/),
            data: fc.uint8Array({ maxLength: 64 }),
          }),
          { minLength: 1, maxLength: 30, selector: ({ stem }) => stem },
        ),
        (generated) => {
          const entries = generated.map(({ stem, data }) => ({
            name: `parts/${stem}.xml`,
            data,
          }));
          const archive = openZipArchive(buildStoredZip(entries));
          expect(archive.entries.map(({ name }) => name)).toEqual(
            entries.map(({ name }) => name),
          );
          expect(archive.entries.map(({ uncompressedSize }) => uncompressedSize)).toEqual(
            entries.map(({ data }) => data.byteLength),
          );
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe("ZIP rejection and limits", () => {
  test.each(["../secret", "a/../secret", "/absolute", "a\\b", "folder/"])(
    "rejects unsafe item name %s",
    (name) => {
      expectZipError(() => openZipArchive(buildStoredZip([{ name }])), "invalid_entry_name");
    },
  );

  test("rejects duplicate entry names", () => {
    expectZipError(
      () => openZipArchive(buildStoredZip([{ name: "a" }, { name: "a" }])),
      "duplicate_entry",
    );
  });

  test("rejects encrypted entries", () => {
    expectZipError(
      () => openZipArchive(buildStoredZip([{ name: "a", flags: 1 }])),
      "encrypted_entry",
    );
  });

  test("rejects unsupported compression methods", () => {
    expectZipError(
      () => openZipArchive(buildStoredZip([{ name: "a", compressionMethod: 12 }])),
      "unsupported_compression",
    );
  });

  test("enforces entry counts before reading central entries", () => {
    expectZipError(
      () => openZipArchive(buildStoredZip([{ name: "a" }, { name: "b" }]), {
        limits: { maxEntries: 1 },
      }),
      "entry_count_limit",
    );
  });

  test("enforces individual entry size", () => {
    expectZipError(
      () => openZipArchive(buildStoredZip([
        { name: "large", data: new Uint8Array(8) },
      ]), { limits: { maxEntryUncompressedBytes: 7 } }),
      "entry_size_limit",
    );
  });

  test("enforces total expanded size", () => {
    expectZipError(
      () => openZipArchive(buildStoredZip([
        { name: "a", data: new Uint8Array(6) },
        { name: "b", data: new Uint8Array(6) },
      ]), { limits: { maxTotalUncompressedBytes: 10 } }),
      "total_size_limit",
    );
  });

  test("rejects suspicious declared compression ratios", () => {
    expectZipError(
      () => openZipArchive(buildStoredZip([
        {
          name: "bomb",
          data: new Uint8Array([0]),
          declaredCompressedSize: 1,
          declaredUncompressedSize: 10_000,
        },
      ]), { limits: { maxCompressionRatio: 100 } }),
      "entry_compression_ratio",
    );
  });

  test("rejects overlapping local entry records", () => {
    expectZipError(
      () => openZipArchive(buildStoredZip([
        {
          name: "first",
          data: new Uint8Array([1]),
          declaredCompressedSize: 20,
          declaredUncompressedSize: 20,
        },
        { name: "second", data: new Uint8Array([2]) },
      ])),
      "overlapping_entries",
    );
  });

  test("rejects ZIP64 sentinel fields", () => {
    expectZipError(
      () => openZipArchive(buildStoredZip([], { totalEntriesOverride: 0xffff })),
      "zip64_unsupported",
    );
  });

  test("rejects truncation at every byte boundary", () => {
    const complete = buildStoredZip([
      { name: "[Content_Types].xml", data: utf8("content") },
      { name: "word/document.xml", data: utf8("document") },
    ]);

    for (let length = 0; length < complete.byteLength; length += 1) {
      expect(() => openZipArchive(complete.subarray(0, length))).toThrow();
    }
  });
});

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function expectZipError(action: () => unknown, code: ZipArchiveErrorCode): void {
  try {
    action();
    throw new Error(`Expected ZIP error ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(ZipArchiveError);
    expect((error as ZipArchiveError).code).toBe(code);
  }
}
