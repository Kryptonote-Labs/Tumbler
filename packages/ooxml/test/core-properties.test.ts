import { describe, expect, test } from "bun:test";
import { beginPackageTransaction, openOpcPackage, PartName } from "@tumblerjs/opc";
import {
  beginCorePropertiesEdit,
  CorePropertiesError,
  parseCoreProperties,
  readCoreProperties,
} from "../src/index.ts";
import { buildDeflatedZip } from "../../opc/test/zip-builder.ts";

const encoder = new TextEncoder();
const CP = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";
const DC = "http://purl.org/dc/elements/1.1/";
const DCTERMS = "http://purl.org/dc/terms/";
const XSI = "http://www.w3.org/2001/XMLSchema-instance";
const RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const TYPES = "http://schemas.openxmlformats.org/package/2006/content-types";
const CORE_REL = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
const CORE_TYPE = "application/vnd.openxmlformats-package.core-properties+xml";

const formats = [
  ["word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"],
  ["xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"],
  ["ppt/presentation.xml", "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"],
] as const;

describe("core properties across Office formats", () => {
  for (const [mainName, mainType] of formats) {
    test(`surgically edits existing metadata in ${mainName}`, () => {
      const source = buildPackage(mainName, mainType, existingCoreXml());
      const base = openOpcPackage(source);
      const mainCompressed = base.archive.compressedBytes(base.archive.get(mainName)!);
      const editor = beginCorePropertiesEdit(base)
        .setTitle(`New <title> & value`)
        .setCreator(undefined)
        .set("description", "Added description");
      const saved = editor.commit();
      const reopened = openOpcPackage(saved);
      const properties = readCoreProperties(reopened)!;

      expect(properties.values.title).toBe(`New <title> & value`);
      expect(properties.values.creator).toBeUndefined();
      expect(properties.values.description).toBe("Added description");
      expect(properties.values.subject).toBe("Preserve this subject");
      expect(properties.document.source).toContain(
        `<dc:subject>Preserve this subject</dc:subject><!--unknown positioning-->`,
      );
      expect(reopened.archive.compressedBytes(reopened.archive.get(mainName)!)).toEqual(
        mainCompressed,
      );
      expect(editor.status).toBe("committed");
    });

    test(`creates missing metadata in ${mainName}`, () => {
      const source = buildPackage(mainName, mainType);
      const saved = beginCorePropertiesEdit(openOpcPackage(source))
        .setTitle("Created title")
        .setCreator("Kryptonote")
        .set("created", "2026-08-02T12:30:00Z")
        .commit();
      const reopened = openOpcPackage(saved);
      const properties = readCoreProperties(reopened)!;
      expect(properties.partName.value).toBe("/docProps/core.xml");
      expect(properties.values).toMatchObject({
        title: "Created title",
        creator: "Kryptonote",
        created: "2026-08-02T12:30:00Z",
      });
      expect(properties.element("created")?.attributes.some(
        (attribute) => attribute.namespaceUri === XSI && attribute.value === "dcterms:W3CDTF",
      )).toBeTrue();
      expect(reopened.getPart(properties.partName)?.contentType).toBe(CORE_TYPE);
    });
  }

  test("returns the exact package bytes when no metadata changes are staged", () => {
    const source = buildPackage(...formats[0], existingCoreXml());
    expect(beginCorePropertiesEdit(openOpcPackage(source)).commit()).toBe(source);
  });

  test("adds missing namespace declarations without rewriting existing attributes", () => {
    const core = `<?xml version="1.0"?><cp:coreProperties xmlns:cp="${CP}"><cp:revision>1</cp:revision></cp:coreProperties>`;
    const source = buildPackage(...formats[0], core);
    const saved = beginCorePropertiesEdit(openOpcPackage(source))
      .setTitle("Title")
      .set("modified", "2026-08-02T13:00:00+01:00")
      .commit();
    const properties = readCoreProperties(openOpcPackage(saved))!;
    expect(properties.values.title).toBe("Title");
    expect(properties.values.modified).toBe("2026-08-02T13:00:00+01:00");
    expect(properties.document.source).toContain(`xmlns:dc="${DC}"`);
    expect(properties.document.source).toContain(`xmlns:dcterms="${DCTERMS}"`);
    expect(properties.document.source).toContain(`xmlns:xsi="${XSI}"`);
    expect(properties.document.source).toContain(`<cp:revision>1</cp:revision>`);
  });

  test("rolls back staged metadata changes", () => {
    const editor = beginCorePropertiesEdit(openOpcPackage(buildPackage(...formats[0])));
    editor.setTitle("discard").rollback();
    expect(editor.status).toBe("rolled_back");
    expect(() => editor.commit()).toThrow(CorePropertiesError);
  });

  test("rejects malformed date values before staging output", () => {
    const editor = beginCorePropertiesEdit(openOpcPackage(buildPackage(...formats[0])));
    expect(() => editor.set("created", "next Tuesday")).toThrow(CorePropertiesError);
    expect(editor.status).toBe("active");
  });
});

describe("core properties validation", () => {
  test("rejects duplicate properties", () => {
    expect(() => parseCoreProperties(
      PartName.parse("/docProps/core.xml"),
      encoder.encode(`<cp:coreProperties xmlns:cp="${CP}" xmlns:dc="${DC}"><dc:title>a</dc:title><dc:title>b</dc:title></cp:coreProperties>`),
    )).toThrow(CorePropertiesError);
  });

  test("rejects invalid dcterms type metadata", () => {
    expect(() => parseCoreProperties(
      PartName.parse("/docProps/core.xml"),
      encoder.encode(`<cp:coreProperties xmlns:cp="${CP}" xmlns:dcterms="${DCTERMS}"><dcterms:created>2026-01-01</dcterms:created></cp:coreProperties>`),
    )).toThrow(CorePropertiesError);
  });

  test("rejects an unreferenced Core Properties part", () => {
    const core = existingCoreXml();
    const base = buildPackage(...formats[0]);
    const archive = openOpcPackage(base);
    const transaction = beginPackageTransaction(archive);
    transaction.addPart("/docProps/core.xml", CORE_TYPE, encoder.encode(core));
    expect(() => readCoreProperties(openOpcPackage(transaction.commit()))).toThrow(
      CorePropertiesError,
    );
  });

  test("reads localized keywords and rejects unrelated keyword markup", () => {
    const valid = parseCoreProperties(
      PartName.parse("/docProps/core.xml"),
      encoder.encode(`<cp:coreProperties xmlns:cp="${CP}"><cp:keywords xml:lang="en-US">color<cp:value xml:lang="en-GB">colour</cp:value></cp:keywords></cp:coreProperties>`),
    );
    expect(valid.values.keywords).toBe("colorcolour");
    expect(() => parseCoreProperties(
      PartName.parse("/docProps/core.xml"),
      encoder.encode(`<cp:coreProperties xmlns:cp="${CP}"><cp:keywords bad="x">no</cp:keywords></cp:coreProperties>`),
    )).toThrow(CorePropertiesError);
  });
});

function existingCoreXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="${CP}" xmlns:dc="${DC}" xmlns:dcterms="${DCTERMS}" xmlns:xsi="${XSI}">
  <dc:title>Old title</dc:title>
  <dc:creator>Original creator</dc:creator>
  <dc:subject>Preserve this subject</dc:subject><!--unknown positioning-->
  <dcterms:created xsi:type="dcterms:W3CDTF">2025-01-02T03:04:05Z</dcterms:created>
</cp:coreProperties>`;
}

function buildPackage(mainName: string, mainType: string, coreXml?: string): Uint8Array {
  const relationships = [
    `<Relationship Id="main" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${mainName}"/>`,
    ...(coreXml === undefined
      ? []
      : [`<Relationship Id="core" Type="${CORE_REL}" Target="docProps/core.xml"/>`]),
  ].join("");
  return buildDeflatedZip([
    {
      name: "[Content_Types].xml",
      data: encoder.encode(`<Types xmlns="${TYPES}">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/${mainName}" ContentType="${mainType}"/>
        ${coreXml === undefined ? "" : `<Override PartName="/docProps/core.xml" ContentType="${CORE_TYPE}"/>`}
      </Types>`),
    },
    { name: "_rels/.rels", data: encoder.encode(`<Relationships xmlns="${RELS}">${relationships}</Relationships>`) },
    { name: mainName, data: encoder.encode(`<main/>`) },
    ...(coreXml === undefined
      ? []
      : [{ name: "docProps/core.xml", data: encoder.encode(coreXml) }]),
  ]);
}
