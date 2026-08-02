import { describe, expect, test } from "bun:test";
import {
  ContentTypesError,
  PartName,
  PartNameError,
  openZipArchive,
  parseContentTypes,
  type ContentTypesErrorCode,
} from "../src/index.ts";
import { buildStoredZip } from "./zip-builder.ts";

const namespace = "http://schemas.openxmlformats.org/package/2006/content-types";
const mainContentTypes = [
  [
    "/word/document.xml",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
  ],
  [
    "/xl/workbook.xml",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
  ],
  [
    "/ppt/presentation.xml",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
  ],
] as const;

describe("OPC part names", () => {
  test.each(["/hello/world/doc.xml", "/é", "/a/%E2%82%AC.xml"])(
    "accepts %s",
    (value) => expect(PartName.parse(value).value).toBe(value),
  );

  test.each([
    "relative.xml",
    "/",
    "/a/",
    "/a//b",
    "/a.",
    "/a/%2F/b",
    "/a/%5c/b",
    "/a/%41.xml",
    "/a/%zz",
    "/a b.xml",
    "/a?b.xml",
    "/a#b.xml",
    "/a[b].xml",
  ])("rejects %s", (value) => {
    expect(() => PartName.parse(value)).toThrow(PartNameError);
  });

  test("compares ASCII case-insensitively and extracts extensions", () => {
    const lower = PartName.parse("/word/document.XML");
    expect(lower.equals(PartName.parse("/WORD/DOCUMENT.xml"))).toBeTrue();
    expect(lower.extension()).toBe("XML");
    expect(PartName.parse("/_rels/.rels").extension()).toBe("rels");
  });
});

describe("content types", () => {
  test.each(mainContentTypes)("resolves the %s main part", (part, contentType) => {
    const types = parseTypes(`
      <Types xmlns="${namespace}">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="${part}" ContentType="${contentType}"/>
      </Types>
    `);

    expect(types.resolve(PartName.parse(part))).toBe(contentType);
    expect(types.resolve(PartName.parse("/custom/PART.XML"))).toBe("application/xml");
    expect(types.defaults).toHaveLength(2);
    expect(types.overrides).toHaveLength(1);
  });

  test("lets an override take precedence over a matching default", () => {
    const types = parseTypes(`
      <Types xmlns="${namespace}">
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/special+xml"/>
      </Types>
    `);
    expect(types.require(PartName.parse("/WORD/DOCUMENT.XML"))).toBe(
      "application/special+xml",
    );
  });

  test("accepts valid media-type parameters", () => {
    const types = parseTypes(`
      <Types xmlns="${namespace}">
        <Default Extension="txt" ContentType='text/plain; charset="utf-8"'/>
      </Types>
    `);
    expect(types.require(PartName.parse("/notes.txt"))).toBe(
      'text/plain; charset="utf-8"',
    );
  });

  test("accepts UTF-16 infrastructure XML", () => {
    const xml = `<Types xmlns="${namespace}"><Default Extension="xml" ContentType="application/xml"/></Types>`;
    const withBom = new Uint8Array([0xff, 0xfe, ...new Uint8Array(Buffer.from(xml, "utf16le"))]);
    const archive = openZipArchive(buildStoredZip([
      { name: "[Content_Types].xml", data: withBom },
    ]));
    expect(parseContentTypes(archive).defaults[0]?.extension).toBe("xml");
  });

  test("reports a missing media-types item", () => {
    const archive = openZipArchive(buildStoredZip([{ name: "word/document.xml" }]));
    expectContentTypesError(() => parseContentTypes(archive), "missing_item");
  });

  test("reports a part without a mapping", () => {
    const types = parseTypes(`<Types xmlns="${namespace}"/>`);
    expectContentTypesError(
      () => types.require(PartName.parse("/word/document.xml")),
      "missing_content_type",
    );
  });

  test.each([
    `<NotTypes xmlns="${namespace}"/>`,
    `<Types xmlns="wrong"/>`,
    `<Types xmlns="${namespace}" unexpected="yes"/>`,
    `<Types xmlns="${namespace}">text</Types>`,
    `<Types xmlns="${namespace}"><Unexpected/></Types>`,
    `<Types xmlns="${namespace}"><Default Extension="xml" ContentType="application/xml"><Nested/></Default></Types>`,
    `<!DOCTYPE Types><Types xmlns="${namespace}"/>`,
  ])("rejects structurally invalid XML", (xml) => {
    expectContentTypesError(() => parseTypes(xml), "invalid_xml");
  });

  test("rejects duplicate defaults case-insensitively", () => {
    expectContentTypesError(() => parseTypes(`
      <Types xmlns="${namespace}">
        <Default Extension="XML" ContentType="application/xml"/>
        <Default Extension="xml" ContentType="text/xml"/>
      </Types>
    `), "duplicate_default");
  });

  test("rejects duplicate overrides case-insensitively", () => {
    expectContentTypesError(() => parseTypes(`
      <Types xmlns="${namespace}">
        <Override PartName="/word/document.xml" ContentType="application/xml"/>
        <Override PartName="/WORD/DOCUMENT.XML" ContentType="text/xml"/>
      </Types>
    `), "duplicate_override");
  });

  test.each(["", ".xml", "x ml", "x/../ml"])(
    "rejects invalid default extension %s",
    (extension) => {
      expectContentTypesError(() => parseTypes(`
        <Types xmlns="${namespace}">
          <Default Extension="${extension}" ContentType="application/xml"/>
        </Types>
      `), "invalid_extension");
    },
  );

  test.each([
    "xml",
    "application",
    " application/xml",
    "application/xml;",
    "application/xml; charset",
    "application/xml\u0001",
  ])(
    "rejects invalid media type %s",
    (contentType) => {
      expectContentTypesError(() => parseTypes(`
        <Types xmlns="${namespace}">
          <Default Extension="xml" ContentType="${contentType}"/>
        </Types>
      `), contentType.includes("\u0001") ? "invalid_xml" : "invalid_content_type");
    },
  );

  test("rejects an invalid override part name", () => {
    expectContentTypesError(() => parseTypes(`
      <Types xmlns="${namespace}">
        <Override PartName="relative.xml" ContentType="application/xml"/>
      </Types>
    `), "invalid_part_name");
  });
});

function parseTypes(xml: string) {
  const archive = openZipArchive(buildStoredZip([
    { name: "[Content_Types].xml", data: new TextEncoder().encode(xml) },
  ]));
  return parseContentTypes(archive);
}

function expectContentTypesError(
  action: () => unknown,
  code: ContentTypesErrorCode,
): void {
  try {
    action();
    throw new Error(`Expected content-types error ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(ContentTypesError);
    expect((error as ContentTypesError).code).toBe(code);
  }
}
