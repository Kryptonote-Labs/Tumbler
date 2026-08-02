import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { openOpcPackage } from "@tumbler/opc";
import { beginCorePropertiesEdit, readCoreProperties } from "../src/index.ts";
import { buildDeflatedZip } from "../../opc/test/zip-builder.ts";

const encoder = new TextEncoder();
const text = fc.array(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 &<>\"'é日𝄞"),
  { maxLength: 128 },
).map((characters) => characters.join(""));
const formats = [
  ["word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"],
  ["xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"],
  ["ppt/presentation.xml", "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"],
] as const;

describe("generated Core Properties transactions", () => {
  test("edits generated values deterministically across every Office family", () => {
    fc.assert(fc.property(
      fc.constantFrom(...formats),
      text,
      text,
      (format, title, creator) => {
        const source = buildPackage(format[0], format[1]);
        const base = openOpcPackage(source);
        const run = () => beginCorePropertiesEdit(base)
          .setTitle(title)
          .setCreator(creator)
          .commit();
        const first = run();
        expect(first).toEqual(run());

        const reopened = openOpcPackage(first);
        const properties = readCoreProperties(reopened)!;
        expect(properties.values.title).toBe(title);
        expect(properties.values.creator).toBe(creator);
        expect(properties.values.subject).toBe("untouched subject");
        expect(reopened.archive.compressedBytes(reopened.archive.get(format[0])!)).toEqual(
          base.archive.compressedBytes(base.archive.get(format[0])!),
        );
      },
    ), { numRuns: 300 });
  });

  test("edit followed by removal converges to absent optional properties", () => {
    fc.assert(fc.property(text, (title) => {
      const source = buildPackage(...formats[0]);
      const edited = beginCorePropertiesEdit(openOpcPackage(source)).setTitle(title).commit();
      const removed = beginCorePropertiesEdit(openOpcPackage(edited))
        .setTitle(undefined)
        .setCreator(undefined)
        .commit();
      const properties = readCoreProperties(openOpcPackage(removed))!;
      expect(properties.values.title).toBeUndefined();
      expect(properties.values.creator).toBeUndefined();
      expect(properties.values.subject).toBe("untouched subject");
    }), { numRuns: 100 });
  });
});

function buildPackage(mainName: string, mainType: string): Uint8Array {
  const cp = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";
  const dc = "http://purl.org/dc/elements/1.1/";
  const coreXml = `<cp:coreProperties xmlns:cp="${cp}" xmlns:dc="${dc}"><dc:title>old</dc:title><dc:creator>old creator</dc:creator><dc:subject>untouched subject</dc:subject></cp:coreProperties>`;
  return buildDeflatedZip([
    {
      name: "[Content_Types].xml",
      data: encoder.encode(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/${mainName}" ContentType="${mainType}"/>
        <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
      </Types>`),
    },
    {
      name: "_rels/.rels",
      data: encoder.encode(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="main" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${mainName}"/>
        <Relationship Id="core" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
      </Relationships>`),
    },
    { name: mainName, data: encoder.encode("<main/>") },
    { name: "docProps/core.xml", data: encoder.encode(coreXml) },
  ]);
}
