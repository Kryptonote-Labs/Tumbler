import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  openOpcPackage,
  openZipArchive,
  PartName,
  saveOpcPackage,
  writeZipArchive,
  writeZipArchiveChanges,
  ZipWriterError,
} from "../src/index.ts";
import { buildDeflatedZip } from "./zip-builder.ts";

const contentTypesNamespace =
  "http://schemas.openxmlformats.org/package/2006/content-types";
const relationshipsNamespace =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const officeDocumentType =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";

const formats = [
  ["word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"],
  ["xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"],
  ["ppt/presentation.xml", "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"],
] as const;

describe("copy-on-write preservation", () => {
  test("returns the original bytes for a no-op save", () => {
    const source = buildOfficePackage(...formats[0]);
    const pkg = openOpcPackage(source);
    const saved = saveOpcPackage(pkg);
    expect(saved).toBe(source);
    expect(saved).toEqual(source);
  });

  for (const [mainName, contentType] of formats) {
    test(`replaces ${mainName} and keeps every untouched compressed payload`, () => {
      const source = buildOfficePackage(mainName, contentType);
      const before = openZipArchive(source);
      const replacement = new TextEncoder().encode(`<edited part="${mainName}"/>`);
      const saved = saveOpcPackage(
        openOpcPackage(source),
        new Map([[PartName.parse(`/${mainName}`), replacement]]),
      );
      const after = openZipArchive(saved);

      expect(after.read(after.get(mainName)!)).toEqual(replacement);
      expect(after.entries.map((entry) => entry.name)).toEqual(
        before.entries.map((entry) => entry.name),
      );
      for (const entry of before.entries) {
        if (entry.name !== mainName) {
          expect(after.compressedBytes(after.get(entry.name)!)).toEqual(
            before.compressedBytes(entry),
          );
          expect(after.read(after.get(entry.name)!)).toEqual(before.read(entry));
        }
      }
      expect(openOpcPackage(saved).mainOfficeDocumentPart().name.value).toBe(`/${mainName}`);
    });
  }

  test("rejects replacement names that are not in the archive", () => {
    const archive = openZipArchive(buildOfficePackage(...formats[0]));
    expect(() => writeZipArchive(
      archive,
      new Map([["missing.xml", new Uint8Array()]]),
    )).toThrow(ZipWriterError);
  });

  test("adds and removes entries while preserving untouched compressed payloads", () => {
    const source = buildOfficePackage(...formats[0]);
    const before = openZipArchive(source);
    const addedData = new TextEncoder().encode("new custom payload");
    const saved = writeZipArchiveChanges(before, {
      additions: [{ name: "custom/data.bin", data: addedData }],
      removals: new Set(["docProps/core.xml"]),
    });
    const after = openZipArchive(saved);

    expect(after.get("docProps/core.xml")).toBeUndefined();
    expect(after.read(after.get("custom/data.bin")!)).toEqual(addedData);
    for (const entry of before.entries) {
      if (entry.name !== "docProps/core.xml") {
        expect(after.compressedBytes(after.get(entry.name)!)).toEqual(
          before.compressedBytes(entry),
        );
      }
    }
  });

  test("rejects contradictory and duplicate archive changes", () => {
    const archive = openZipArchive(buildOfficePackage(...formats[0]));
    expect(() => writeZipArchiveChanges(archive, {
      replacements: new Map([["word/document.xml", new Uint8Array()]]),
      removals: new Set(["word/document.xml"]),
    })).toThrow(ZipWriterError);
    expect(() => writeZipArchiveChanges(archive, {
      additions: [{ name: "word/document.xml", data: new Uint8Array() }],
    })).toThrow(ZipWriterError);
    expect(() => writeZipArchiveChanges(archive, {
      removals: new Set(["missing.xml"]),
    })).toThrow(ZipWriterError);
  });

  test("round-trips generated replacement bytes through deflate and CRC verification", () => {
    const source = buildOfficePackage(...formats[0]);
    const pkg = openOpcPackage(source);
    fc.assert(fc.property(
      fc.uint8Array({ maxLength: 16_384 }),
      (replacement) => {
        const saved = saveOpcPackage(
          pkg,
          new Map([["/word/document.xml", replacement]]),
        );
        const reopened = openOpcPackage(saved);
        expect(reopened.readPart(reopened.mainOfficeDocumentPart())).toEqual(replacement);
      },
    ), { numRuns: 100 });
  });
});

function buildOfficePackage(mainName: string, contentType: string): Uint8Array {
  const encoder = new TextEncoder();
  return buildDeflatedZip([
    {
      name: "[Content_Types].xml",
      data: encoder.encode(`<Types xmlns="${contentTypesNamespace}">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/${mainName}" ContentType="${contentType}"/>
      </Types>`),
    },
    {
      name: "_rels/.rels",
      data: encoder.encode(`<Relationships xmlns="${relationshipsNamespace}">
        <Relationship Id="main" Type="${officeDocumentType}" Target="${mainName}"/>
      </Relationships>`),
    },
    { name: mainName, data: encoder.encode("<main>before</main>") },
    { name: "docProps/core.xml", data: encoder.encode("<untouched>metadata</untouched>") },
  ]);
}
