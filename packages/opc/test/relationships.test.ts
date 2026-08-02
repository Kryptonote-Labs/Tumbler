import { describe, expect, test } from "bun:test";
import {
  parseRelationships,
  PartName,
  relationshipItemName,
  RelationshipsError,
  type RelationshipsErrorCode,
} from "../src/index.ts";
import { openZipArchive } from "../src/zip/archive.ts";
import { buildStoredZip } from "./zip-builder.ts";

const namespace = "http://schemas.openxmlformats.org/package/2006/relationships";
const officeDocumentTypes = [
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument",
] as const;

describe("relationship item names", () => {
  test("maps package and part sources to their relationship items", () => {
    expect(relationshipItemName(null)).toBe("_rels/.rels");
    expect(relationshipItemName(PartName.parse("/word/document.xml"))).toBe(
      "word/_rels/document.xml.rels",
    );
    expect(relationshipItemName(PartName.parse("/workbook.xml"))).toBe(
      "_rels/workbook.xml.rels",
    );
  });
});

describe("relationships", () => {
  test.each([
    ["docx", "word/document.xml"],
    ["xlsx", "xl/workbook.xml"],
    ["pptx", "ppt/presentation.xml"],
  ])("resolves the %s package main part", (_format, mainPart) => {
    const relationships = parsePackageRelationships(`
      <Relationships xmlns="${namespace}">
        <Relationship Id="rId1" Type="${officeDocumentTypes[0]}" Target="${mainPart}"/>
      </Relationships>
    `);
    const relationship = relationships.get("rId1");
    expect(relationship?.targetMode).toBe("Internal");
    if (relationship?.targetMode === "Internal") {
      expect(relationship.targetPartName.value).toBe(`/${mainPart}`);
    }
  });

  test("resolves targets relative to a source part and retains fragments", () => {
    const source = PartName.parse("/word/document.xml");
    const relationships = parsePartRelationships(source, `
      <Relationships xmlns="${namespace}">
        <Relationship Id="styles" Type="https://example.test/styles" Target="styles.xml#heading"/>
        <Relationship Id="theme" Type="https://example.test/theme" Target="../theme/theme1.xml" TargetMode="Internal"/>
      </Relationships>
    `);
    const styles = relationships.get("styles");
    const theme = relationships.get("theme");
    expect(styles?.targetMode).toBe("Internal");
    expect(theme?.targetMode).toBe("Internal");
    if (styles?.targetMode === "Internal" && theme?.targetMode === "Internal") {
      expect(styles.targetPartName.value).toBe("/word/styles.xml");
      expect(styles.fragment).toBe("heading");
      expect(theme.targetPartName.value).toBe("/theme/theme1.xml");
    }
  });

  test("normalizes dot segments without treating package paths as filesystem paths", () => {
    const relationships = parsePartRelationships(
      PartName.parse("/word/document.xml"),
      `<Relationships xmlns="${namespace}"><Relationship Id="root" Type="https://example.test/a" Target="../../../a.xml"/></Relationships>`,
    );
    const relationship = relationships.get("root");
    expect(relationship?.targetMode).toBe("Internal");
    if (relationship?.targetMode === "Internal") {
      expect(relationship.targetPartName.value).toBe("/a.xml");
    }
  });

  test("keeps external targets opaque", () => {
    const relationships = parsePackageRelationships(`
      <Relationships xmlns="${namespace}">
        <Relationship Id="web" Type="https://example.test/link" Target="https://example.com/a?x=1" TargetMode="External"/>
      </Relationships>
    `);
    expect(relationships.get("web")).toEqual({
      id: "web",
      type: "https://example.test/link",
      target: "https://example.com/a?x=1",
      targetMode: "External",
    });
  });

  test("supports strict OOXML relationship type IRIs", () => {
    const relationships = parsePackageRelationships(`
      <Relationships xmlns="${namespace}">
        <Relationship Id="main" Type="${officeDocumentTypes[1]}" Target="word/document.xml"/>
      </Relationships>
    `);
    expect(relationships.byType(officeDocumentTypes[1])).toHaveLength(1);
  });

  test("rejects duplicate relationship IDs", () => {
    expectRelationshipsError(() => parsePackageRelationships(`
      <Relationships xmlns="${namespace}">
        <Relationship Id="same" Type="https://example.test/a" Target="a.xml"/>
        <Relationship Id="same" Type="https://example.test/b" Target="b.xml"/>
      </Relationships>
    `), "duplicate_id");
  });

  test.each([
    `<Relationships xmlns="wrong"/>`,
    `<Relationships xmlns="${namespace}" extra="x"/>`,
    `<Relationships xmlns="${namespace}">text</Relationships>`,
    `<Relationships xmlns="${namespace}"><Unexpected/></Relationships>`,
    `<!DOCTYPE Relationships><Relationships xmlns="${namespace}"/>`,
  ])("rejects invalid infrastructure XML", (xml) => {
    expectRelationshipsError(() => parsePackageRelationships(xml), "invalid_xml");
  });

  test.each([
    `<Relationship Id="1bad" Type="https://example.test/a" Target="a.xml"/>`,
    `<Relationship Id="ok" Type="relative/type" Target="a.xml"/>`,
    `<Relationship Id="ok" Type="https://example.test/a" Target=""/>`,
    `<Relationship Id="ok" Type="https://example.test/a" Target="a.xml" TargetMode="Elsewhere"/>`,
    `<Relationship Id="ok" Type="https://example.test/a" Target="a.xml" Extra="x"/>`,
  ])("rejects malformed relationship metadata", (relationship) => {
    expectRelationshipsError(() => parsePackageRelationships(`
      <Relationships xmlns="${namespace}">${relationship}</Relationships>
    `), "invalid_relationship");
  });

  test.each(["https://example.com/a.xml", "//example.com/a.xml", "a.xml?query=1"])(
    "rejects invalid internal target %s",
    (target) => {
      expectRelationshipsError(() => parsePartRelationships(
        PartName.parse("/word/document.xml"),
        `<Relationships xmlns="${namespace}"><Relationship Id="ok" Type="https://example.test/a" Target="${target}"/></Relationships>`,
      ), "invalid_target");
    },
  );

  test("reports a missing relationship item", () => {
    const archive = openZipArchive(buildStoredZip([{ name: "word/document.xml" }]));
    expectRelationshipsError(() => parseRelationships(archive, null), "missing_item");
  });
});

function parsePackageRelationships(xml: string) {
  const archive = archiveWith("_rels/.rels", xml);
  return parseRelationships(archive, null);
}

function parsePartRelationships(source: PartName, xml: string) {
  const archive = archiveWith(relationshipItemName(source), xml);
  return parseRelationships(archive, source);
}

function archiveWith(name: string, xml: string) {
  return openZipArchive(buildStoredZip([
    { name, data: new TextEncoder().encode(xml) },
  ]));
}

function expectRelationshipsError(
  action: () => unknown,
  code: RelationshipsErrorCode,
): void {
  try {
    action();
    throw new Error(`Expected relationships error ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(RelationshipsError);
    expect((error as RelationshipsError).code).toBe(code);
  }
}
